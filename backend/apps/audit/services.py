from .models import AuditLog


class AuditService:
    @staticmethod
    def record(*, action, entity_type, entity_id='', organization_id=None, actor=None, metadata=None):
        return AuditLog.objects.create(
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id else '',
            organization_id=organization_id,
            actor=actor,
            metadata=metadata or {},
        )
