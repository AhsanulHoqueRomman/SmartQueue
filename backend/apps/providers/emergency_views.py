from collections import Counter
from django.shortcuts import get_object_or_404
from django.db.models import Case, When
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import ProviderProfile, ProviderEmergency, EmergencyRecovery
from .emergencies import EmergencyService, require, role, attempt_email, audit
from django.db import transaction


def scoped_provider(request, organization_id, provider_id):
    provider=get_object_or_404(ProviderProfile.objects.select_related('membership__organization','membership__user'),
        pk=provider_id,membership__organization_id=organization_id,membership__role='PROVIDER')
    require(request.user,provider,['PROVIDER','MANAGER','STAFF'])
    return provider


def recovery_data(row):
    appt=row.appointment
    return {'id':str(row.pk),'appointment_id':str(appt.pk),'customer_name':appt.customer_display_name,
            'contact_phone':appt.contact_phone or appt.customer.phone_number or '',
            'service_id':str(appt.service_id),'original_serial':row.original_snapshot['serial'],
            'original_date':str(row.original_date),'original_queue_status':row.original_snapshot['queue_status'],
            'resolution':row.resolution,'resolution_label':row.get_resolution_display(),
            'queue_entry_id':str(appt.queue_entry.pk),'current_queue_status':appt.queue_entry.status,
            'interrupted_at':row.interrupted_at,
            'contact_attempts':row.contact_attempts,'consent_note':row.consent_note,
            'replacement_id':str(row.replacement_id) if row.replacement_id else None}


def incident_data(incident, actor):
    roles=role(actor,incident.provider)
    rows=incident.recoveries.select_related('appointment__customer')
    data={'id':str(incident.pk),'provider_id':str(incident.provider_id),'service_date':str(incident.service_date),
          'state':incident.state,'status_label':incident.get_state_display(),
          'resume_requested_at':incident.resume_requested_at,'version':incident.version,
          'outbound_contact_allowed':incident.state in ['UNAVAILABLE','RESUMED'],
          'unresolved_count':rows.filter(resolution='UNRESOLVED').count(),
          'recoveries':[recovery_data(r) for r in rows] if roles in ['MANAGER','STAFF'] else [],
          'active_consultations':[{'id':str(r.pk),'serial':r.original_snapshot['serial'],
              'queue_entry_id':str(r.appointment.queue_entry.pk),'status':r.appointment.queue_entry.status,'interrupted_at':r.interrupted_at}
              for r in rows.filter(resolution='UNRESOLVED',appointment__queue_entry__status__in=['CALLED','IN_PROGRESS'])],
          'email_states':dict(Counter(incident.communications.values_list('email_state',flat=True)))}
    if roles in ['MANAGER','PROVIDER']: data['private_reason']=incident.private_reason
    return data


class EmergencyListView(APIView):
    permission_classes=[IsAuthenticated]
    def get(self,request,organization_id,provider_id):
        provider=scoped_provider(request,organization_id,provider_id)
        rows=provider.emergencies.order_by('-service_date',
            Case(When(state__in=['TEMPORARY', 'UNAVAILABLE'], then=0), default=1),
            '-declared_at', '-pk')
        if request.query_params.get('service_date'):
            field=serializers.DateField(); rows=rows.filter(service_date=field.run_validation(request.query_params['service_date']))
        return Response([incident_data(i,request.user) for i in rows])
    def post(self,request,organization_id,provider_id):
        from apps.queue.services import current_business_date
        class Input(serializers.Serializer):
            service_date=serializers.DateField(default=current_business_date)
            private_reason=serializers.CharField(required=False,allow_blank=True,max_length=1000,default='')
        provider=scoped_provider(request,organization_id,provider_id)
        payload=Input(data=request.data);payload.is_valid(raise_exception=True)
        incident=EmergencyService.declare(provider=provider,actor=request.user,**payload.validated_data)
        return Response(incident_data(incident,request.user),status=200)


class EmergencyActionView(APIView):
    permission_classes=[IsAuthenticated]
    def post(self,request,organization_id,provider_id,incident_id):
        provider=scoped_provider(request,organization_id,provider_id)
        incident=get_object_or_404(ProviderEmergency,pk=incident_id,provider=provider)
        class Input(serializers.Serializer):
            action=serializers.ChoiceField(choices=['REQUEST_RESUME','APPROVE_RESUME','CONFIRM_UNAVAILABLE','RETRY_EMAILS'])
        payload=Input(data=request.data);payload.is_valid(raise_exception=True)
        action=payload.validated_data['action']
        if action=='RETRY_EMAILS':
            require(request.user,provider,['MANAGER'])
            # Sending/accepted/uncertain dispatches are deliberately not retried.
            for delivery in incident.communications.filter(email_state__in=['PENDING','FAILED']): attempt_email(delivery.pk)
            audit(incident,request.user,'EMAIL_RETRY_REQUESTED')
        else: incident=EmergencyService.transition(incident=incident,actor=request.user,action=action)
        return Response(incident_data(incident,request.user))


class EmergencyRecoveryView(APIView):
    permission_classes=[IsAuthenticated]
    def post(self,request,organization_id,provider_id,incident_id,recovery_id):
        provider=scoped_provider(request,organization_id,provider_id)
        incident=get_object_or_404(ProviderEmergency,pk=incident_id,provider=provider)
        recovery=get_object_or_404(EmergencyRecovery.objects.select_related('incident','appointment'),pk=recovery_id,incident=incident)
        class Input(serializers.Serializer):
            action=serializers.ChoiceField(choices=['CONTACT','RESCHEDULE','CANCEL','INTERRUPTED'])
            direction=serializers.ChoiceField(choices=['INBOUND','OUTBOUND'],required=False)
            outcome=serializers.ChoiceField(choices=['REACHED','UNREACHABLE','UNDECIDED','DECLINED_OPTION','ATTENDING'],required=False)
            note=serializers.CharField(required=False,allow_blank=True,max_length=1000,default='')
            request_id=serializers.UUIDField(required=False)
            consent=serializers.BooleanField(required=False,default=False)
            consent_note=serializers.CharField(required=False,allow_blank=True,max_length=1000,default='')
            target_date=serializers.DateField(required=False)
            target_provider_id=serializers.UUIDField(required=False)
            def validate(self,data):
                if data['action']!='INTERRUPTED' and not data.get('direction'): raise serializers.ValidationError('Contact direction is required.')
                if data['action']=='CONTACT' and not {'request_id','outcome'}<=data.keys(): raise serializers.ValidationError('Contact request ID and outcome are required.')
                if data['action']=='RESCHEDULE' and not data.get('target_date'): raise serializers.ValidationError('A replacement date is required.')
                return data
        payload=Input(data=request.data);payload.is_valid(raise_exception=True);values=payload.validated_data
        action=values.pop('action')
        require(request.user,provider,['PROVIDER','MANAGER','STAFF'] if action=='INTERRUPTED' else ['MANAGER','STAFF'])
        if action=='INTERRUPTED':
            result=EmergencyService.interrupt(recovery=recovery,actor=request.user)
        elif action=='CONTACT':
            result=EmergencyService.contact(recovery=recovery,actor=request.user,**{k:values[k] for k in ['direction','outcome','note','request_id']})
        else:
            result=EmergencyService.recover(recovery=recovery,actor=request.user,action=action,
                **{k:v for k,v in values.items() if k in ['direction','consent','consent_note','target_date','target_provider_id']})
        return Response(incident_data(incident,request.user) if role(request.user,provider)=='PROVIDER' else recovery_data(result))
