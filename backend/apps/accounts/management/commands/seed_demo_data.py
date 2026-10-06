import random
from datetime import datetime, time, timedelta
from decimal import Decimal
from django.core.management.base import BaseCommand, CommandError
from django.db.models.deletion import Collector, ProtectedError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership, OrganizationOperatingHours
from apps.accounts.management.demo_enrichment import enrich_definitions, provider_day_hours
from apps.providers.pricing import effective_customer_charge
from apps.services.models import Category, Service
from apps.providers.models import (
    ProviderProfile,
    ProviderService,
    WeeklySchedule,
    ScheduleBreak,
)
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.feedback.models import Review
from apps.notifications.models import Notification
from apps.audit.models import AuditLog


class Command(BaseCommand):
    help = "Seeds SmartQueue with a rich, multi-industry, deterministic Bangladeshi demo dataset."

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Remove and rebuild only the deterministic SmartQueue demo dataset',
        )

    def handle(self, *args, **options):
        random.seed(42)
        self.stdout.write(self.style.SUCCESS("Starting SmartQueue multi-industry demo data seeding..."))

        with transaction.atomic():
            if options.get('reset'):
                self.clean_demo_data()
            demo_accounts, orgs, categories, services, providers, appointments, queue_entries, reviews = self.seed_all()

        self.stdout.write(self.style.SUCCESS("\n" + "=" * 65))
        self.stdout.write(self.style.SUCCESS("SUCCESSFULLY SEEDED SMARTQUEUE MULTI-INDUSTRY DEMO DATASET!"))
        self.stdout.write(self.style.SUCCESS("=" * 65))
        self.stdout.write(f"  - Organizations:  {len(orgs)}")
        self.stdout.write(f"  - Categories:     {len(categories)}")
        self.stdout.write(f"  - Services:       {len(services)}")
        self.stdout.write(f"  - Total Users:    {User.objects.count()}")
        self.stdout.write(f"  - Providers:      {len(providers)}")
        self.stdout.write(f"  - Appointments:   {len(appointments)}")
        self.stdout.write(f"  - Queue Entries:  {len(queue_entries)}")
        self.stdout.write(f"  - Reviews:        {len(reviews)}")
        self.stdout.write(f"  - Notifications:  {Notification.objects.count()}")
        self.stdout.write(f"  - Audit Logs:     {AuditLog.objects.count()}")

        self.stdout.write(self.style.SUCCESS("\n--- DEMO LOGIN ACCOUNTS (New accounts: password123; retained accounts keep their passwords) ---"))
        self.stdout.write("  - Admin / Superuser: admin@example.com")
        self.stdout.write("  - Manager:           manager.demo@example.com (Dhaka Care Clinic)")
        self.stdout.write("  - Provider:          provider.demo@example.com (Dr. Tanvir Ahmed)")
        self.stdout.write("  - Staff:             staff.demo@example.com (Dhaka Care Clinic)")
        self.stdout.write("  - Customer:          customer.demo@example.com (Sadia Rahman)")
        self.stdout.write(self.style.SUCCESS("=" * 65 + "\n"))

    @transaction.atomic
    def clean_demo_data(self):
        """Exact seed identities are reserved demo roots, never namespace patterns.

        Keep a seed user if any relationship remains after demo roots are removed.
        This includes non-demo memberships/bookings and standalone audit history.
        """
        accounts, customers, definitions = self.demo_definitions()
        slugs = [definition['slug'] for definition in definitions]
        emails = {account[0] for account in accounts}
        emails.update(customer[2] for customer in customers)
        for definition in definitions:
            identities = [definition['manager'], *definition['staff']]
            identities.extend(provider['user'] for provider in definition['providers_data'])
            emails.update(identity[2] for identity in identities)
        org_ids = list(Organization.objects.filter(slug__in=slugs).values_list('pk', flat=True))

        def delete_owned(queryset):
            # Inspect the actual cascade before mutation. Mixed tenant references
            # must fail closed rather than delete a record owned by another org.
            collector = Collector(using=queryset.db)
            try:
                collector.collect(queryset)
            except ProtectedError as error:
                raise CommandError('Demo reset blocked by protected cross-dataset references.') from error
            collected = [(model, model.objects.filter(pk__in=[obj.pk for obj in objects]))
                         for model, objects in collector.data.items()]
            collected.extend((query.model, query) for query in collector.fast_deletes)
            for model, query in collected:
                fields = {field.name for field in model._meta.fields}
                if 'organization' in fields and query.exclude(organization_id__in=org_ids).exists():
                    raise CommandError('Demo reset blocked: cascade would remove non-demo organization data.')
                if model is ProviderService and query.exclude(service__organization_id__in=org_ids).exists():
                    raise CommandError('Demo reset blocked: provider assignment references a non-demo service.')
            queryset.delete()

        self.stdout.write('Cleaning recognized SmartQueue demo roots...')
        # PROTECT requires appointments before services, and services before
        # categories. Remaining organization-owned records cascade from roots.
        delete_owned(Appointment.objects.filter(organization_id__in=org_ids))
        delete_owned(Service.objects.filter(organization_id__in=org_ids))
        delete_owned(Organization.objects.filter(pk__in=org_ids))
        retained = 0
        for user in User.objects.filter(email__in=emails):
            related = any(
                relation.related_model._base_manager.filter(**{relation.field.name: user.pk}).exists()
                for relation in User._meta.related_objects
            )
            if related:
                retained += 1
            else:
                user.delete()
        self.stdout.write(self.style.SUCCESS(
            f'Demo roots cleaned; retained {retained} demo identities with remaining relationships.'
        ))

    def _get_or_create_user(self, email, password, first_name, last_name, phone_number, is_superuser=False):
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'first_name': first_name,
                'last_name': last_name,
                'phone_number': phone_number,
                'is_active': True,
                'is_staff': is_superuser,
                'is_superuser': is_superuser,
            }
        )
        if created:
            user.set_password(password)
            user.save()
        return user

    @staticmethod
    def demo_definitions():
        # Shared source for creation and the exact reset allowlists.
        accounts = [
            ('admin@example.com', 'password123', 'System', 'Admin', '+8801700000000', True),
            ('manager.demo@example.com', 'password123', 'Ahsanul', 'Hoque', '+8801711112222', False),
            ('provider.demo@example.com', 'password123', 'Dr. Tanvir', 'Ahmed', '+8801722223333', False),
            ('staff.demo@example.com', 'password123', 'Nusrat', 'Jahan', '+8801733334444', False),
            ('customer.demo@example.com', 'password123', 'Sadia', 'Rahman', '+8801744445555', False),
        ]
        manager_demo = ('Ahsanul', 'Hoque', accounts[1][0])
        provider_demo_user = ('Dr. Tanvir', 'Ahmed', accounts[2][0])
        staff_demo_user = ('Nusrat', 'Jahan', accounts[3][0])

        # 2. Customer Pool
        bangla_customers_data = [
            ('Fahim', 'Hasan', 'fahim.hasan@example.com'),
            ('Mahmudul', 'Islam', 'mahmudul.islam@example.com'),
            ('Mehedi', 'Hasan', 'mehedi.hasan@example.com'),
            ('Arif', 'Hossain', 'arif.hossain@example.com'),
            ('Rakibul', 'Hasan', 'rakibul.hasan@example.com'),
            ('Tanjila', 'Akter', 'tanjila.akter@example.com'),
            ('Samia', 'Rahman', 'samia.rahman@example.com'),
            ('Nafis', 'Ahmed', 'nafis.ahmed@example.com'),
            ('Saif', 'Hasan', 'saif.hasan@example.com'),
            ('Mim', 'Akter', 'mim.akter@example.com'),
            ('Rafiul', 'Islam', 'rafiul.islam@example.com'),
            ('Sharmeen', 'Sultana', 'sharmeen.sultana@example.com'),
            ('Imran', 'Hossain', 'imran.hossain@example.com'),
            ('Farhan', 'Kabir', 'farhan.kabir@example.com'),
            ('Jannatul', 'Ferdous', 'jannatul.ferdous@example.com'),
            ('Adnan', 'Rahman', 'adnan.rahman@example.com'),
            ('Kazi', 'Nazrul', 'kazi.nazrul@example.com'),
            ('Farhana', 'Yeasmin', 'farhana.yeasmin@example.com'),
            ('Subrata', 'Chowdhury', 'subrata.chowdhury@example.com'),
            ('Tahmidur', 'Rahman', 'tahmidur.rahman@example.com'),
        ]

        # 3. Multi-Industry Organizations Definition (All 6 Industries Represented)
        orgs_definition = [
            # ---------------------------------------------------------------
            # HEALTHCARE
            # ---------------------------------------------------------------
            {
                'industry_type': Organization.IndustryType.HEALTHCARE,
                'name': 'Dhaka Care Clinic',
                'slug': 'dhaka-care-clinic',
                'address': 'House 42, Road 27, Dhanmondi, Dhaka 1209',
                'phone': '+88029660000',
                'email': 'contact@dhakacare.example.com',
                'logo': 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=300&auto=format&fit=crop',
                'cover_image': 'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=1200&auto=format&fit=crop',
                'description': 'Leading multi-specialty healthcare outpatient facility in Dhanmondi providing general medicine, dermatology, and pediatric consultations.',
                'manager': manager_demo,
                'staff': [staff_demo_user],
                'categories': [
                    ('General Medicine', 'general-medicine', 'Primary care and internal medicine consultations', 'stethoscope', 1),
                    ('Dermatology & Skin Care', 'dermatology', 'Advanced skin, hair, and laser dermatological care', 'sparkles', 2),
                    ('Pediatrics', 'pediatrics', 'Comprehensive healthcare and growth monitoring for children', 'baby', 3),
                ],
                'services': [
                    ('general-medicine', 'General Medical Consultation', 'Comprehensive health checkup and general diagnosis.', 20, '800.00'),
                    ('general-medicine', 'Specialist Follow-up Review', 'Follow-up review for ongoing medical treatments.', 15, '500.00'),
                    ('dermatology', 'Full Skin & Laser Checkup', 'Dermatological assessment for skin conditions and laser therapy.', 30, '1200.00'),
                    ('pediatrics', 'Pediatric Growth & Health Audit', 'Growth, vaccination, and pediatric wellness checkup.', 25, '1000.00'),
                ],
                'providers_data': [
                    {
                        'user': provider_demo_user,
                        'title': 'Dr. Senior Consultant (Medicine & Skin)',
                        'bio': 'Senior physician with over 12 years of clinical experience in internal medicine and dermatological consultation.',
                        'profile_photo': 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400&auto=format&fit=crop',
                        'experience_years': 12,
                        'education': [
                            {'degree': 'MBBS', 'institution': 'Dhaka Medical College', 'year': '2010'},
                            {'degree': 'FCPS (Medicine)', 'institution': 'BCPS', 'year': '2016'},
                        ],
                        'experience_history': [
                            {'role': 'Senior Consultant', 'organization': 'Dhaka Care Clinic', 'period': '2018-Present', 'description': 'Head of Outpatient Internal Medicine.'},
                            {'role': 'Registrar', 'organization': 'Square Hospital', 'period': '2012-2017', 'description': 'Internal medicine inpatient registrar.'},
                        ],
                        'certifications': [
                            {'name': 'Certified Clinical Internist', 'issuer': 'BMDC', 'year': '2011'},
                            {'name': 'Advanced Skin Care & Laser Certificate', 'issuer': 'AAS', 'year': '2018'},
                        ],
                        'specialties': ['Internal Medicine', 'Dermatology', 'Hypertension', 'Diabetes Management'],
                        'service_names': ['General Medical Consultation', 'Specialist Follow-up Review', 'Full Skin & Laser Checkup', 'Pediatric Growth & Health Audit'], # Multi-category provider!
                    },
                    {
                        'user': ('Tanjila', 'Akter', 'dr.tanjila@dhakacare.example.com'),
                        'title': 'Dr. Tanjila Akter, Dermatology Specialist',
                        'bio': 'Specialist in clinical dermatology, acne therapy, and aesthetic skin procedures.',
                        'profile_photo': 'https://images.unsplash.com/photo-1594824813566-88855ce78c4c?w=400&auto=format&fit=crop',
                        'experience_years': 9,
                        'education': [
                            {'degree': 'MBBS', 'institution': 'Chittagong Medical College', 'year': '2013'},
                            {'degree': 'DDV (Dermatology)', 'institution': 'BSMMU', 'year': '2018'},
                        ],
                        'experience_history': [
                            {'role': 'Assistant Professor Dermatology', 'organization': 'Enam Medical College', 'period': '2019-Present', 'description': 'Academic and clinical instruction.'},
                        ],
                        'certifications': [
                            {'name': 'Aesthetic Dermatology Fellow', 'issuer': 'Dermatology Society BD', 'year': '2019'},
                        ],
                        'specialties': ['Acne Vulgaris', 'Laser Hair Removal', 'Eczema', 'Psoriasis'],
                        'service_names': ['Full Skin & Laser Checkup'],
                    },
                ]
            },

            {
                'industry_type': Organization.IndustryType.HEALTHCARE,
                'name': 'CarePlus Diagnostic & Imaging',
                'slug': 'careplus-diagnostic',
                'address': 'Plot 12, Main Road, Dhanmondi, Dhaka 1205',
                'phone': '+88029669480',
                'email': 'info@careplusdiag.example.com',
                'logo': 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=300&auto=format&fit=crop',
                'cover_image': 'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=1200&auto=format&fit=crop',
                'description': 'Advanced diagnostic pathology lab and digital MRI/CT imaging center.',
                'manager': ('Mahmudul', 'Islam', 'mahmudul.careplus@example.com'),
                'staff': [('Samia', 'Rahman', 'samia.careplus@example.com')],
                'categories': [
                    ('Pathology Lab', 'pathology-lab', 'Diagnostic blood, urine, and metabolic lab panels', 'flask', 1),
                    ('Radiology & MRI', 'radiology-mri', 'Digital X-Ray, Ultrasonogram, and MRI imaging', 'activity', 2),
                ],
                'services': [
                    ('pathology-lab', 'Comprehensive Health Screening Lab Panel', 'Full blood count, lipid profile, kidney & liver screening.', 25, '3500.00'),
                    ('radiology-mri', 'High-Resolution Lumbar Spine MRI Scan', '1.5T MRI imaging for spine and nerve root assessment.', 30, '7000.00'),
                ],
                'providers_data': [
                    {
                        'user': ('Ariful', 'Islam', 'dr.ariful@careplus.example.com'),
                        'title': 'Dr. Ariful Islam, Consultant Radiologist',
                        'bio': 'Expert radiologist specializing in neuro-imaging and musculoskeletal MRI interpretation.',
                        'profile_photo': 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=400&auto=format&fit=crop',
                        'experience_years': 15,
                        'education': [
                            {'degree': 'MBBS', 'institution': 'Sir Salimullah Medical College', 'year': '2007'},
                            {'degree': 'MD (Radiology)', 'institution': 'BSMMU', 'year': '2014'},
                        ],
                        'experience_history': [
                            {'role': 'Chief Radiologist', 'organization': 'CarePlus Diagnostic', 'period': '2016-Present', 'description': 'Head of Diagnostic Imaging.'},
                        ],
                        'certifications': [
                            {'name': 'MRI Specialist Certification', 'issuer': 'Asian Society of Radiology', 'year': '2015'},
                        ],
                        'specialties': ['Neuro MRI', 'CT Angiography', 'Musculoskeletal Ultrasound'],
                        'service_names': ['Comprehensive Health Screening Lab Panel', 'High-Resolution Lumbar Spine MRI Scan'],
                    }
                ]
            },

            # ---------------------------------------------------------------
            # LEGAL
            # ---------------------------------------------------------------
            {
                'industry_type': Organization.IndustryType.LEGAL,
                'name': 'ABC Legal Associates',
                'slug': 'abc-legal-associates',
                'address': 'Level 8, City Center Tower, Motijheel C/A, Dhaka 1000',
                'phone': '+88029550099',
                'email': 'contact@abclegal.example.com',
                'logo': 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?w=300&auto=format&fit=crop',
                'cover_image': 'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=1200&auto=format&fit=crop',
                'description': 'Premier corporate, commercial, and property law firm in Dhaka providing corporate registration, land title vetting, and dispute resolution.',
                'manager': ('Sharmin', 'Sultana', 'sharmin.legal@example.com'),
                'staff': [('Nafis', 'Ahmed', 'nafis.legal@example.com')],
                'categories': [
                    ('Corporate & Commercial Law', 'corporate-law', 'Company RJSC registration, shareholder contracts, and FDI licensing', 'briefcase', 1),
                    ('Property & Real Estate Law', 'property-law', 'Land title vetting, deed registration, and property dispute counsel', 'home', 2),
                    ('Family & Civil Litigation', 'family-civil-law', 'Civil litigation, family settlement, and arbitration advisory', 'scale', 3),
                ],
                'services': [
                    ('corporate-law', 'Company RJSC Registration Consultation', 'Comprehensive guidance on corporate entity setup and RJSC filing.', 60, '15000.00'),
                    ('corporate-law', 'Commercial Contract Review & Vetting', 'Detailed legal risk review for commercial agreements and NDAs.', 45, '8000.00'),
                    ('property-law', 'Land Deed & Title Legal Vetting', 'Verification of ownership history, CS/SA/RS khatian, and deed validity.', 60, '12000.00'),
                    ('family-civil-law', 'Family Settlement & Civil Consultation', 'Legal counsel regarding inheritance, family settlement, and civil suits.', 45, '6000.00'),
                ],
                'providers_data': [
                    {
                        'user': ('Rahim', 'Chowdhury', 'adv.rahim@abclegal.example.com'),
                        'title': 'Barrister Rahim Chowdhury, Head of Corporate Law',
                        'bio': 'Senior corporate advocate with 14 years experience advising startups, banks, and multinational corporations in Bangladesh.',
                        'profile_photo': 'https://images.unsplash.com/photo-1556157382-97eda2d62296?w=400&auto=format&fit=crop',
                        'experience_years': 14,
                        'education': [
                            {'degree': 'LL.B (Honours)', 'institution': 'University of London', 'year': '2008'},
                            {'degree': 'Bar-at-Law', 'institution': "Lincoln's Inn, UK", 'year': '2010'},
                        ],
                        'experience_history': [
                            {'role': 'Senior Partner', 'organization': 'ABC Legal Associates', 'period': '2015-Present', 'description': 'Managing corporate & FDI practice.'},
                            {'role': 'Associate Advocate', 'organization': 'Fox Mandal BD', 'period': '2010-2014', 'description': 'Commercial drafting and arbitration.'},
                        ],
                        'certifications': [
                            {'name': 'Enrolled Advocate', 'issuer': 'Bangladesh Bar Council', 'year': '2011'},
                            {'name': 'High Court Division Permission', 'issuer': 'Supreme Court of Bangladesh', 'year': '2014'},
                        ],
                        'specialties': ['Corporate Governance', 'FDI Licensing', 'Property Vetting', 'Commercial Arbitration'],
                        'service_names': ['Company RJSC Registration Consultation', 'Commercial Contract Review & Vetting', 'Land Deed & Title Legal Vetting', 'Family Settlement & Civil Consultation'], # Multi-category legal practitioner!
                    }
                ]
            },

            # ---------------------------------------------------------------
            # BEAUTY
            # ---------------------------------------------------------------
            {
                'industry_type': Organization.IndustryType.BEAUTY,
                'name': 'Glow Beauty Studio & Spa',
                'slug': 'glow-beauty-studio',
                'address': 'Pink City Shopping Complex, Gulshan-2, Dhaka 1212',
                'phone': '+880175550011',
                'email': 'booking@glowbeauty.example.com',
                'logo': 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=300&auto=format&fit=crop',
                'cover_image': 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=1200&auto=format&fit=crop',
                'description': 'Luxury salon and wellness spa offering executive hair styling, organic hydra-facials, and bridal makeover packages.',
                'manager': ('Tamanna', 'Yasmin', 'tamanna.glow@example.com'),
                'staff': [('Rokia', 'Begum', 'rokia.glow@example.com')],
                'categories': [
                    ('Hair Styling & Treatment', 'hair-care', 'Precision haircut, blow-dry, keratin smoothing, and organic hair spa', 'scissors', 1),
                    ('Skin & Hydra Facial', 'skin-care', 'Deep pore cleansing, collagen boost, and skin rejuvenation facials', 'sparkles', 2),
                    ('Bridal Makeover', 'makeup-bridal', 'Trial makeover, party glam, and high-definition bridal makeup', 'palette', 3),
                ],
                'services': [
                    ('hair-care', 'Executive Haircut & Keratin Smoothing', 'Wash, cut, blow-dry, and deep keratin protein smoothing.', 60, '3500.00'),
                    ('skin-care', 'Hydra-Rejuvenation Organic Facial', '6-step deep cleansing and hydration facial treatment.', 60, '4500.00'),
                    ('makeup-bridal', 'Bridal Glam Makeup Consultation & Trial', 'High-definition trial makeover and bridal wedding styling session.', 90, '12000.00'),
                ],
                'providers_data': [
                    {
                        'user': ('Farzana', 'Shakil-Assoc', 'farzana.stylist@glowbeauty.example.com'),
                        'title': 'Farzana Shakil Associate, Master Stylist',
                        'bio': 'Certified international hair artist and aesthetician with 11 years experience in bridal makeover and skin therapy.',
                        'profile_photo': 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=400&auto=format&fit=crop',
                        'experience_years': 11,
                        'education': [
                            {'degree': 'Diploma in Hair & Beauty', 'institution': 'Pivot Point Academy, UK', 'year': '2012'},
                        ],
                        'experience_history': [
                            {'role': 'Master Stylist', 'organization': 'Glow Beauty Studio', 'period': '2017-Present', 'description': 'Lead bridal and aesthetic specialist.'},
                            {'role': 'Senior Aesthetician', 'organization': 'Persona Beauty Care', 'period': '2013-2017', 'description': 'Skin and hair care specialist.'},
                        ],
                        'certifications': [
                            {'name': 'Certified HydraFacial Operator', 'issuer': 'Aesthetic International', 'year': '2018'},
                        ],
                        'specialties': ['Bridal Makeover', 'Keratin Smoothing', 'Hydra Facial', 'Hair Color'],
                        'service_names': ['Executive Haircut & Keratin Smoothing', 'Hydra-Rejuvenation Organic Facial', 'Bridal Glam Makeup Consultation & Trial'], # Multi-category beautician!
                    }
                ]
            },

            # ---------------------------------------------------------------
            # REPAIR
            # ---------------------------------------------------------------
            {
                'industry_type': Organization.IndustryType.REPAIR,
                'name': 'CoolTech Service Center',
                'slug': 'cooltech-service-center',
                'address': 'Multiplan Center, Elephant Road, Dhaka 1205',
                'phone': '+8801788990011',
                'email': 'support@cooltech.example.com',
                'logo': 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=300&auto=format&fit=crop',
                'cover_image': 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=1200&auto=format&fit=crop',
                'description': 'Multi-brand hardware repair hub specializing in laptop chip-level diagnostics, mobile screen replacement, and inverter AC servicing.',
                'manager': ('Imran', 'Hossain', 'imran.cooltech@example.com'),
                'staff': [('Farhan', 'Kabir', 'farhan.cooltech@example.com')],
                'categories': [
                    ('Laptop & Computer Repair', 'laptop-pc-repair', 'Chip-level motherboard repair, display replacement, and OS recovery', 'laptop', 1),
                    ('Smartphone Repair', 'mobile-repair', 'OLED display assembly, battery replacement, and logic board soldering', 'smartphone', 2),
                    ('Home Appliance Repair', 'home-appliances', 'Inverter AC master servicing, gas refilling, and PCB board repair', 'wrench', 3),
                ],
                'services': [
                    ('laptop-pc-repair', 'Laptop Motherboard & Chip Repair Audit', 'Component-level motherboard diagnostic and GPU/power IC repair.', 45, '2500.00'),
                    ('mobile-repair', 'Smartphone Screen & Battery Replacement', 'Original OLED display assembly and high-capacity battery installation.', 30, '1800.00'),
                    ('home-appliances', 'Inverter AC Master Servicing & Gas Refill', 'Indoor/outdoor pressure wash, jet cleaning, and Freon gas refill.', 60, '3000.00'),
                ],
                'providers_data': [
                    {
                        'user': ('Kamrul', 'Hasan-Eng', 'eng.kamrul@cooltech.example.com'),
                        'title': 'Engr. Kamrul Hasan, Chief Technical Specialist',
                        'bio': 'Hardware engineer with 10 years experience in micro-soldering, laptop motherboard chip diagnostics, and mobile logic boards.',
                        'profile_photo': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&auto=format&fit=crop',
                        'experience_years': 10,
                        'education': [
                            {'degree': 'B.Sc in Electrical Engineering', 'institution': 'DUET', 'year': '2013'},
                        ],
                        'experience_history': [
                            {'role': 'Chief Hardware Specialist', 'organization': 'CoolTech Service Center', 'period': '2017-Present', 'description': 'Lead technician for laptop & smartphone chip repair.'},
                        ],
                        'certifications': [
                            {'name': 'Apple Certified Macintosh Technician (ACMT)', 'issuer': 'Apple Inc.', 'year': '2016'},
                            {'name': 'Dell Certified Hardware Expert', 'issuer': 'Dell Technologies', 'year': '2015'},
                        ],
                        'specialties': ['Micro Soldering', 'GPU BGA Reballing', 'iPhone Logic Board Repair', 'AC PCB Diagnostics'],
                        'service_names': ['Laptop Motherboard & Chip Repair Audit', 'Smartphone Screen & Battery Replacement', 'Inverter AC Master Servicing & Gas Refill'], # Multi-category technician!
                    }
                ]
            },

            # ---------------------------------------------------------------
            # CONSULTING
            # ---------------------------------------------------------------
            {
                'industry_type': Organization.IndustryType.CONSULTING,
                'name': 'Nexus Business & Tax Consulting',
                'slug': 'nexus-business-consulting',
                'address': 'Road 11, Block D, Banani, Dhaka 1213',
                'phone': '+88029881122',
                'email': 'advisory@nexusconsulting.example.com',
                'logo': 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=300&auto=format&fit=crop',
                'cover_image': 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1200&auto=format&fit=crop',
                'description': 'Strategic corporate advisory firm providing NBR tax planning, audit preparation, RJSC compliance, and IT cloud transformation consulting.',
                'manager': ('Moniruzzaman', 'Khan', 'monir.nexus@example.com'),
                'staff': [('Taskin', 'Ahmed', 'taskin.nexus@example.com')],
                'categories': [
                    ('Tax & Financial Advisory', 'tax-finance', 'Corporate income tax planning, NBR return audit, and ICAB audit preparation', 'calculator', 1),
                    ('Business Strategy & Advisory', 'business-strategy', 'Startup valuation, corporate restructuring, and expansion feasibility studies', 'trending-up', 2),
                    ('IT & Cloud Architecture', 'it-consulting', 'Cloud security audit, software architecture review, and DevOps transformation', 'cpu', 3),
                ],
                'services': [
                    ('tax-finance', 'Corporate Tax Planning & NBR Return Audit', 'Strategic corporate tax optimization and annual NBR tax return filing advisory.', 60, '10000.00'),
                    ('business-strategy', 'Startup Growth & Financial Valuation Advisory', 'Investment pitch deck evaluation, business valuation, and term sheet review.', 60, '15000.00'),
                    ('it-consulting', 'Cloud Security & Software Architecture Audit', 'Infrastructure review, AWS/Azure security audit, and scalability assessment.', 60, '20000.00'),
                ],
                'providers_data': [
                    {
                        'user': ('Tariqul', 'Islam-FCA', 'fca.tariq@nexusconsulting.example.com'),
                        'title': 'Tariqul Islam FCA, Managing Partner & Financial Advisor',
                        'bio': 'Fellow Chartered Accountant with 15 years experience in corporate taxation, audit compliance, and startup financial restructuring.',
                        'profile_photo': 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop',
                        'experience_years': 15,
                        'education': [
                            {'degree': 'BBA in Accounting', 'institution': 'University of Dhaka', 'year': '2006'},
                            {'degree': 'FCA (Chartered Accountant)', 'institution': 'ICAB', 'year': '2011'},
                        ],
                        'experience_history': [
                            {'role': 'Managing Partner', 'organization': 'Nexus Business Consulting', 'period': '2016-Present', 'description': 'Leading tax advisory and corporate finance.'},
                            {'role': 'Senior Audit Manager', 'organization': 'KPMG Bangladesh', 'period': '2011-2015', 'description': 'Statutory audit of banking and telecom sector.'},
                        ],
                        'certifications': [
                            {'name': 'Certified Income Tax Practitioner (ITP)', 'issuer': 'National Board of Revenue (NBR)', 'year': '2012'},
                        ],
                        'specialties': ['Corporate Tax Audits', 'Financial Restructuring', 'Mergers & Acquisitions', 'NBR Disputes'],
                        'service_names': ['Corporate Tax Planning & NBR Return Audit', 'Startup Growth & Financial Valuation Advisory', 'Cloud Security & Software Architecture Audit'], # Multi-category consultant!
                    }
                ]
            },

            # ---------------------------------------------------------------
            # OTHER
            # ---------------------------------------------------------------
            {
                'industry_type': Organization.IndustryType.OTHER,
                'name': 'Green Line Express Counter & Support',
                'slug': 'green-line-express-counter',
                'address': 'Fakirapool Bus Counter, Motijheel, Dhaka 1000',
                'phone': '+88029331122',
                'email': 'counter@greenlineexpress.example.com',
                'logo': 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=300&auto=format&fit=crop',
                'cover_image': 'https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=1200&auto=format&fit=crop',
                'description': 'Central customer support counter for inter-city VIP bus ticket reservation, parcel tracking, and luggage assistance.',
                'manager': ('Subrata', 'Chowdhury', 'subrata.greenline@example.com'),
                'staff': [('Tahmidur', 'Rahman', 'tahmidur.greenline@example.com')],
                'categories': [
                    ('Ticket Reservation', 'ticket-reservation', 'VIP Scania/Volvo sleeper bus ticket booking and schedule adjustment', 'ticket', 1),
                    ('Parcel & Cargo Inquiry', 'parcel-cargo', 'Inter-city express parcel tracking, claim processing, and freight inquiry', 'package', 2),
                ],
                'services': [
                    ('ticket-reservation', 'VIP Bus Sleeper Ticket Booking & Seat Selection', 'Personalized assistance for seat reservation and schedule modification.', 15, '150.00'),
                    ('parcel-cargo', 'Express Parcel Tracking & Claim Consultation', 'Waybill verification, lost package inquiry, and delivery status tracking.', 15, '100.00'),
                ],
                'providers_data': [
                    {
                        'user': ('Moniruzzaman', 'Operations-Lead', 'officer.monir@greenline.example.com'),
                        'title': 'Moniruzzaman Khan, Senior Customer Operations Lead',
                        'bio': 'Customer relations and logistics operations specialist with 7 years experience in transport ticketing and parcel tracking.',
                        'profile_photo': 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&auto=format&fit=crop',
                        'experience_years': 7,
                        'education': [
                            {'degree': 'B.A. (Honours)', 'institution': 'National University', 'year': '2016'},
                        ],
                        'experience_history': [
                            {'role': 'Senior Counter Lead', 'organization': 'Green Line Express', 'period': '2019-Present', 'description': 'Managing passenger ticketing and cargo support.'},
                        ],
                        'certifications': [
                            {'name': 'Certified Customer Service Associate', 'issuer': 'Transport Association BD', 'year': '2018'},
                        ],
                        'specialties': ['Seat Allocation Systems', 'Cargo Waybill Tracking', 'Customer Complaint Resolution'],
                        'service_names': ['VIP Bus Sleeper Ticket Booking & Seat Selection', 'Express Parcel Tracking & Claim Consultation'], # Multi-category counter lead!
                    }
                ]
            },
        ]

        return accounts, bangla_customers_data, enrich_definitions(orgs_definition)

    def seed_all(self):
        accounts, bangla_customers_data, orgs_definition = self.demo_definitions()
        admin_user, manager_demo, provider_demo_user, staff_demo_user, customer_demo_user = [
            self._get_or_create_user(*account) for account in accounts
        ]
        customers = [customer_demo_user]
        for fn, ln, em in bangla_customers_data:
            customers.append(self._get_or_create_user(
                em, 'password123', fn, ln, f"+88018{random.randint(10000000, 99999999)}"
            ))

        org_instances = []
        category_instances = []
        service_instances = []
        provider_instances = []

        for odef in orgs_definition:
            # A. Organization (Deterministic update_or_create)
            org, _ = Organization.objects.update_or_create(
                slug=odef['slug'],
                defaults={
                    'name': odef['name'],
                    'industry_type': odef['industry_type'],
                    'address': odef['address'],
                    'phone_number': odef['phone'],
                    'email': odef['email'],
                    'logo': odef['logo'],
                    'cover_image': odef['cover_image'],
                    'description': odef['description'],
                    'is_active': True,
                    'verification_status': Organization.VerificationStatus.APPROVED,
                }
            )
            org_instances.append(org)
            for day, hours in odef['operating_hours'].items():
                OrganizationOperatingHours.objects.update_or_create(
                    organization=org, day_of_week=day,
                    defaults={'is_closed': hours is None,
                              'open_time': time(hours[0]) if hours else None,
                              'close_time': time(hours[1]) if hours else None},
                )

            # B. Manager Membership
            m_data = odef['manager']
            if isinstance(m_data, User):
                m_user = m_data
            else:
                m_user = self._get_or_create_user(m_data[2], 'password123', m_data[0], m_data[1], f"+88017{random.randint(10000000, 99999999)}")
            
            OrganizationMembership.objects.get_or_create(
                user=m_user,
                organization=org,
                defaults={'role': OrganizationMembership.Role.MANAGER, 'is_active': True}
            )

            # C. Staff Memberships
            for s_data in odef['staff']:
                if isinstance(s_data, User):
                    s_user = s_data
                else:
                    s_user = self._get_or_create_user(s_data[2], 'password123', s_data[0], s_data[1], f"+88017{random.randint(10000000, 99999999)}")
                OrganizationMembership.objects.get_or_create(
                    user=s_user,
                    organization=org,
                    defaults={'role': OrganizationMembership.Role.STAFF, 'is_active': True}
                )

            # D. Categories (Deterministic update_or_create per Organization)
            org_categories_by_slug = {}
            for cat_name, cat_slug, cat_desc, cat_icon, cat_order in odef['categories']:
                cat, _ = Category.objects.update_or_create(
                    organization=org,
                    slug=cat_slug,
                    defaults={
                        'name': cat_name,
                        'description': cat_desc,
                        'icon': cat_icon,
                        'display_order': cat_order,
                        'is_active': True,
                    }
                )
                org_categories_by_slug[cat_slug] = cat
                category_instances.append(cat)

            # E. Services (Linked to Category)
            org_services_by_name = {}
            for cat_slug, sname, sdesc, sdur, sprice in odef['services']:
                cat_obj = org_categories_by_slug.get(cat_slug)
                svc, _ = Service.objects.update_or_create(
                    organization=org,
                    name=sname,
                    defaults={
                        'category': cat_obj,
                        'description': sdesc,
                        'duration_minutes': sdur,
                        'price': sprice,
                        'is_active': True,
                    }
                )
                org_services_by_name[sname] = svc
                service_instances.append(svc)

            # F. Providers & ProviderProfiles
            for idx, p_item in enumerate(odef['providers_data'], start=1):
                if isinstance(p_item['user'], User):
                    p_user = p_item['user']
                else:
                    fn, ln, em = p_item['user']
                    p_user = self._get_or_create_user(em, 'password123', fn, ln, f"+88017{random.randint(10000000, 99999999)}")

                mem, _ = OrganizationMembership.objects.get_or_create(
                    user=p_user,
                    organization=org,
                    defaults={'role': OrganizationMembership.Role.PROVIDER, 'is_active': True}
                )

                profile, _ = ProviderProfile.objects.update_or_create(
                    membership=mem,
                    defaults={
                        'title': p_item['title'],
                        'bio': p_item['bio'],
                        'profile_photo': p_item['profile_photo'],
                        'experience_years': p_item['experience_years'],
                        'education': p_item['education'],
                        'experience_history': p_item['experience_history'],
                        'certifications': p_item['certifications'],
                        'specialties': p_item['specialties'],
                        'application_status': ProviderProfile.ApplicationStatus.APPROVED,
                        'is_active': True,
                    }
                )
                provider_instances.append(profile)

                # Source charges only; computed customer pricing stays in pricing.py.
                for sname in p_item['service_names']:
                    charge = p_item['custom_prices'][sname]
                    ProviderService.objects.update_or_create(
                        provider=profile, service=org_services_by_name[sname],
                        defaults={'custom_price': Decimal(charge) if charge is not None else None},
                    )

                for day_idx, public_hours in odef['operating_hours'].items():
                    work_start, work_end, is_work = provider_day_hours(public_hours, idx - 1, day_idx)
                    ws, _ = WeeklySchedule.objects.update_or_create(
                        provider=profile, day_of_week=day_idx,
                        defaults={'start_time': work_start, 'end_time': work_end, 'is_working_day': is_work},
                    )
                    ws.breaks.filter(title='Lunch & Prayer Break').delete()
                    if is_work and work_end.hour - work_start.hour >= 5:
                        break_hour = work_start.hour + 3
                        ScheduleBreak.objects.update_or_create(
                            weekly_schedule=ws, title='Rest & Prayer Break',
                            defaults={'start_time': time(break_hour), 'end_time': time(break_hour, 30)},
                        )
                    else:
                        ws.breaks.filter(title='Rest & Prayer Break').delete()

        # 4. Generate Appointments, Queue Entries, Reviews
        appointment_instances = []
        queue_instances = []
        review_instances = []

        today_date = timezone.localdate()

        sample_review_comments = [
            "Very helpful and professional service. Highly recommended!",
            "The service was smooth, punctual, and well-organized.",
            "Good experience overall. Clean and modern facilities.",
            "Appointment started right on time. Excellent behavior.",
            "Friendly and skilled professional. Very satisfied with the care.",
        ]

        token_counter_map = {}

        # Historical Completed Appointments (Past 14 days)
        for i in range(70):
            days_ago = (i % 14) + 1
            appt_date = today_date - timedelta(days=days_ago)
            provider = provider_instances[i % len(provider_instances)]
            org = provider.organization
            assignments = list(provider.provider_services.select_related('service').order_by('service__name'))
            available_services = [assignment.service for assignment in assignments]
            if not available_services:
                continue
            assignment = assignments[i % len(assignments)]
            service = assignment.service
            customer = customers[i % len(customers)]

            # Historical fixtures occur on a valid provider working day.
            schedule = provider.weekly_schedules.get(day_of_week=appt_date.weekday())
            while not schedule.is_working_day:
                appt_date -= timedelta(days=1)
                schedule = provider.weekly_schedules.get(day_of_week=appt_date.weekday())
            q_key = (provider.id, appt_date)
            t_num = token_counter_map.get(q_key, 1)
            start_dt, end_dt = self.fixture_forecast(schedule, appt_date, service.duration_minutes, t_num)

            appt, _ = Appointment.objects.get_or_create(
                organization=org,
                customer=customer,
                provider=provider,
                service=service,
                start_datetime=start_dt,
                defaults={
                    'end_datetime': end_dt,
                    'appointment_date': appt_date,
                    'serial_number': t_num,
                    'booking_channel': Appointment.BookingChannel.ONLINE,
                    'arrival_type': Appointment.ArrivalType.SCHEDULED,
                    'status': Appointment.Status.COMPLETED,
                    'notes': 'Fictional demo historical appointment completed successfully.',
                    **self.fixture_snapshots(assignment, customer),
                }
            )
            appointment_instances.append(appt)

            token_counter_map[q_key] = t_num + 1

            q_entry, _ = QueueEntry.objects.get_or_create(
                organization=org,
                appointment=appt,
                defaults={
                    'provider': provider,
                    'queue_date': appt_date,
                    'serial_number': t_num,
                    'token_number': t_num,
                    'is_checked_in': True,
                    'checked_in_at': start_dt,
                    'status': QueueEntry.Status.COMPLETED,
                    'called_at': start_dt + timedelta(minutes=2),
                    'started_at': start_dt + timedelta(minutes=4),
                    'completed_at': end_dt,
                }
            )
            queue_instances.append(q_entry)

            # Review
            r_rating = 4 if (i % 3 == 0) else 5
            rev, _ = Review.objects.get_or_create(
                organization=org,
                appointment=appt,
                defaults={
                    'customer': customer,
                    'provider': provider,
                    'rating': r_rating,
                    'comment': sample_review_comments[i % len(sample_review_comments)],
                }
            )
            review_instances.append(rev)

        # Today's Active Live Queue Entries for Primary Demo Providers
        active_demo_providers = self.live_fixture_providers(provider_instances, today_date)
        for p_idx, provider in enumerate(active_demo_providers):
            org = provider.organization
            assignments = list(provider.provider_services.select_related('service').order_by('service__name'))
            available_services = [assignment.service for assignment in assignments]
            if not available_services:
                continue
            assignment = assignments[0]
            service = assignment.service
            schedule = provider.weekly_schedules.get(day_of_week=today_date.weekday())
            now_dt = timezone.now()

            today_queue_states = [
                # (serial, status, booking_channel, arrival_type, is_checked_in, notes)
                (1, QueueEntry.Status.IN_PROGRESS, Appointment.BookingChannel.ONLINE, Appointment.ArrivalType.SCHEDULED, True, "Consultation currently in progress."),
                (2, QueueEntry.Status.CALLED, Appointment.BookingChannel.FRONT_DESK, Appointment.ArrivalType.WALK_IN, True, "Patient called to counter."),
                (3, QueueEntry.Status.WAITING, Appointment.BookingChannel.ONLINE, Appointment.ArrivalType.SCHEDULED, True, "Patient arrived & checked in."),
                (4, QueueEntry.Status.WAITING, Appointment.BookingChannel.PHONE, Appointment.ArrivalType.SCHEDULED, False, "Scheduled patient not yet checked in."),
                (5, QueueEntry.Status.WAITING, Appointment.BookingChannel.FRONT_DESK, Appointment.ArrivalType.WALK_IN, True, "Front desk walk-in patient."),
            ]

            for s_num, q_status, b_chan, a_type, checked_in, note in today_queue_states:
                cust = customers[(p_idx * 5 + s_num) % len(customers)]
                start_dt, end_dt = self.fixture_forecast(schedule, today_date, service.duration_minutes, s_num)

                appt_status = Appointment.Status.CONFIRMED
                if q_status == QueueEntry.Status.IN_PROGRESS:
                    appt_status = Appointment.Status.IN_PROGRESS
                elif q_status == QueueEntry.Status.COMPLETED:
                    appt_status = Appointment.Status.COMPLETED

                appt, _ = Appointment.objects.get_or_create(
                    organization=org,
                    provider=provider,
                    appointment_date=today_date,
                    serial_number=s_num,
                    defaults={
                        'customer': cust,
                        'service': service,
                        'start_datetime': start_dt,
                        'end_datetime': end_dt,
                        'booking_channel': b_chan,
                        'arrival_type': a_type,
                        'status': appt_status,
                        'notes': note,
                        **self.fixture_snapshots(assignment, cust),
                    }
                )
                appointment_instances.append(appt)

                q_entry, _ = QueueEntry.objects.get_or_create(
                    organization=org,
                    provider=provider,
                    queue_date=today_date,
                    serial_number=s_num,
                    defaults={
                        'appointment': appt,
                        'token_number': s_num,
                        'status': q_status,
                        'is_checked_in': checked_in,
                        'checked_in_at': now_dt - timedelta(minutes=15) if checked_in else None,
                        'called_at': now_dt - timedelta(minutes=2) if q_status in (QueueEntry.Status.CALLED, QueueEntry.Status.IN_PROGRESS) else None,
                        'started_at': now_dt - timedelta(minutes=5) if q_status == QueueEntry.Status.IN_PROGRESS else None,
                    }
                )
                queue_instances.append(q_entry)

        demo_accounts = [admin_user, manager_demo, provider_demo_user, staff_demo_user, customer_demo_user]
        return demo_accounts, org_instances, category_instances, service_instances, provider_instances, appointment_instances, queue_instances, review_instances

    @staticmethod
    def fixture_snapshots(assignment, customer):
        # Used only as defaults for new fixtures; existing history is never rewritten.
        return {'booked_service_charge': effective_customer_charge(assignment),
                'contact_name': customer.get_full_name(), 'contact_phone': customer.phone_number}

    @classmethod
    def live_fixture_providers(cls, providers, day):
        selected = []
        for provider in providers:
            schedule = provider.weekly_schedules.get(day_of_week=day.weekday())
            if not schedule.is_working_day:
                continue
            assignment = provider.provider_services.select_related('service').order_by('service__name').first()
            if assignment is None:
                continue
            _, end = cls.fixture_forecast(schedule, day, assignment.service.duration_minutes, 5)
            if timezone.localtime(end).time() <= schedule.end_time:
                selected.append(provider)
                if len(selected) == 3:
                    break
        return selected

    @staticmethod
    def fixture_forecast(schedule, day, duration, serial):
        """Deterministic fixture forecast within availability, not patient time slots."""
        cursor = timezone.make_aware(datetime.combine(day, schedule.start_time))
        for position in range(serial):
            end = cursor + timedelta(minutes=duration)
            for rest in schedule.breaks.order_by('start_time'):
                rest_start = timezone.make_aware(datetime.combine(day, rest.start_time))
                rest_end = timezone.make_aware(datetime.combine(day, rest.end_time))
                if cursor < rest_end and end > rest_start:
                    cursor = rest_end
                    end = cursor + timedelta(minutes=duration)
            if position < serial - 1:
                cursor = end
        return cursor, end
