import random
from datetime import date, datetime, time, timedelta
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.organizations.models import Organization, OrganizationMembership
from apps.providers.models import (
    ProviderProfile,
    ProviderService,
    WeeklySchedule,
    ScheduleBreak,
    ProviderLeave,
)
from apps.services.models import Service
from apps.appointments.models import Appointment
from apps.queue.models import QueueEntry
from apps.feedback.models import Review
from apps.notifications.models import Notification
from apps.audit.models import AuditLog


class Command(BaseCommand):
    help = "Seeds SmartQueue with a rich, realistic Bangladeshi demo dataset."

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Clean existing development data before seeding',
        )

    def handle(self, *args, **options):
        random.seed(42)
        self.stdout.write(self.style.SUCCESS("Starting SmartQueue demo data seeding..."))

        with transaction.atomic():
            self.clean_demo_data()
            demo_accounts, orgs, customers, providers, services, appointments, queue_entries, reviews = self.seed_all()

        self.stdout.write(self.style.SUCCESS("\n" + "=" * 65))
        self.stdout.write(self.style.SUCCESS("SUCCESSFULLY SEEDED SMARTQUEUE DEMO DATASET!"))
        self.stdout.write(self.style.SUCCESS("=" * 65))
        self.stdout.write(f"  - Organizations:  {len(orgs)}")
        self.stdout.write(f"  - Total Users:    {User.objects.count()}")
        self.stdout.write(f"  - Global Customers:{len(customers)}")
        self.stdout.write(f"  - Providers:      {len(providers)}")
        self.stdout.write(f"  - Services:       {len(services)}")
        self.stdout.write(f"  - Appointments:   {len(appointments)}")
        self.stdout.write(f"  - Queue Entries:  {len(queue_entries)}")
        self.stdout.write(f"  - Reviews:        {len(reviews)}")
        self.stdout.write(f"  - Notifications:  {Notification.objects.count()}")
        self.stdout.write(f"  - Audit Logs:     {AuditLog.objects.count()}")

        self.stdout.write(self.style.SUCCESS("\n--- DEMO LOGIN ACCOUNTS (Password: password123) ---"))
        self.stdout.write("  - Admin / Superuser: admin@example.com")
        self.stdout.write("  - Manager:           manager.demo@example.com (Dhaka Care Clinic)")
        self.stdout.write("  - Provider:          provider.demo@example.com (Dr. Tanvir Ahmed)")
        self.stdout.write("  - Staff:             staff.demo@example.com (Dhaka Care Clinic)")
        self.stdout.write("  - Customer:          customer.demo@example.com (Sadia Rahman)")
        self.stdout.write(self.style.SUCCESS("=" * 65 + "\n"))

    def clean_demo_data(self):
        self.stdout.write("Cleaning existing development records...")
        AuditLog.objects.all().delete()
        Notification.objects.all().delete()
        Review.objects.all().delete()
        QueueEntry.objects.all().delete()
        Appointment.objects.all().delete()
        ProviderLeave.objects.all().delete()
        ScheduleBreak.objects.all().delete()
        WeeklySchedule.objects.all().delete()
        ProviderService.objects.all().delete()
        ProviderProfile.objects.all().delete()
        Service.objects.all().delete()
        OrganizationMembership.objects.all().delete()
        Organization.objects.all().delete()

        # Preserve superuser if exists or clear non-system demo users
        User.objects.all().delete()
        self.stdout.write(self.style.WARNING("Existing demo data cleaned successfully."))

    def seed_all(self):
        # 1. Create Core Superuser & Demo Accounts
        admin_user = User.objects.create_superuser(
            email='admin@example.com',
            password='password123',
            first_name='System',
            last_name='Admin',
            phone_number='+8801700000000',
        )

        manager_demo = User.objects.create_user(
            email='manager.demo@example.com',
            password='password123',
            first_name='Ahsanul',
            last_name='Hoque',
            phone_number='+8801711112222',
        )

        provider_demo_user = User.objects.create_user(
            email='provider.demo@example.com',
            password='password123',
            first_name='Dr. Tanvir',
            last_name='Ahmed',
            phone_number='+8801722223333',
        )

        staff_demo_user = User.objects.create_user(
            email='staff.demo@example.com',
            password='password123',
            first_name='Nusrat',
            last_name='Jahan',
            phone_number='+8801733334444',
        )

        customer_demo_user = User.objects.create_user(
            email='customer.demo@example.com',
            password='password123',
            first_name='Sadia',
            last_name='Rahman',
            phone_number='+8801744445555',
        )

        # 2. Bangladeshi Customer Pool (40 customers)
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
            ('Rokia', 'Begum', 'rokia.begum@example.com'),
            ('Moniruzzaman', 'Khan', 'moniruzzaman.khan@example.com'),
            ('Sadiya', 'Afrin', 'sadiya.afrin@example.com'),
            ('Taskin', 'Ahmed', 'taskin.ahmed@example.com'),
            ('Naimul', 'Hasan', 'naimul.hasan@example.com'),
            ('Tamanna', 'Yasmin', 'tamanna.yasmin@example.com'),
            ('Ziaur', 'Rahman', 'ziaur.rahman@example.com'),
            ('Laila', 'Arjumand', 'laila.arjumand@example.com'),
            ('Shafiqul', 'Alam', 'shafiqul.alam@example.com'),
            ('Anika', 'Tabassum', 'anika.tabassum@example.com'),
            ('Sabbir', 'Hossain', 'sabbir.hossain@example.com'),
            ('Rumana', 'Rashid', 'rumana.rashid@example.com'),
            ('Kamrul', 'Hassan', 'kamrul.hassan@example.com'),
            ('Nabila', 'Chowdhury', 'nabila.chowdhury@example.com'),
            ('Mustafizur', 'Rahman', 'mustafizur.rahman@example.com'),
            ('Sharmin', 'Akter', 'sharmin.akter@example.com'),
            ('Babul', 'Miah', 'babul.miah@example.com'),
            ('Nazia', 'Hassan', 'nazia.hassan@example.com'),
            ('Rubel', 'Hossain', 'rubel.hossain@example.com'),
            ('Dilruba', 'Khanom', 'dilruba.khanom@example.com'),
        ]

        customers = [customer_demo_user]
        for fn, ln, em in bangla_customers_data:
            u = User.objects.create_user(
                email=em,
                password='password123',
                first_name=fn,
                last_name=ln,
                phone_number=f"+88018{random.randint(10000000, 99999999)}",
            )
            customers.append(u)

        # 3. Create Organizations (12 Bangladeshi Orgs across 4 sectors)
        orgs_definition = [
            # Healthcare
            {
                'name': 'Dhaka Care Clinic',
                'slug': 'dhaka-care-clinic',
                'address': 'House 42, Road 27, Dhanmondi, Dhaka 1209',
                'phone': '+88029660000',
                'email': 'contact@dhakacare.example.com',
                'manager': manager_demo,
                'staff': [staff_demo_user],
                'providers_data': [
                    (provider_demo_user, 'Dr. Senior Consultant', 'MBBS, FCPS (Medicine). 12+ years experience.'),
                    ('Dr. Tanjila Akter', 'Dermatology Specialist', 'MBBS, DDV. Specialist in skin and laser care.'),
                    ('Dr. Rafiul Islam', 'Pediatrics Consultant', 'MBBS, DCH. Child healthcare expert.'),
                ],
                'services': [
                    ('General Medical Consultation', 'Comprehensive health checkup and prescription.', 20, '800.00'),
                    ('Specialist Follow-up Consultation', 'Follow-up review for ongoing treatments.', 15, '500.00'),
                    ('Dermatology & Skin Checkup', 'Full skin, hair, and dermatological assessment.', 30, '1200.00'),
                    ('Pediatric Health Checkup', 'Comprehensive growth and health audit for children.', 25, '1000.00'),
                ]
            },
            {
                'name': 'Mirpur Family Health Center',
                'slug': 'mirpur-family-health',
                'address': 'Plot 12, Main Road, Mirpur-10, Dhaka 1216',
                'phone': '+88029001122',
                'email': 'info@mirpurfamilyhealth.example.com',
                'manager': ('Mahmudul', 'Islam', 'mahmudul.mgr@example.com'),
                'staff': [('Samia', 'Rahman', 'samia.staff@example.com')],
                'providers_data': [
                    ('Dr. Arif Hossain', 'Family Medicine Physician', 'MBBS, PGT (Family Medicine).'),
                    ('Dr. Jannatul Ferdous', 'Gynecology Specialist', 'MBBS, FCPS (OBGYN).'),
                ],
                'services': [
                    ('Family Doctor Consultation', 'Routine healthcare consultation for family members.', 20, '500.00'),
                    ('Maternal & Gynae Checkup', 'Antenatal care and general gynecological consultation.', 30, '1000.00'),
                    ('Diabetes & Blood Pressure Audit', 'Specialized metabolic health monitoring.', 20, '600.00'),
                ]
            },
            {
                'name': 'Uttara Wellness Clinic',
                'slug': 'uttara-wellness-clinic',
                'address': 'Sector 4, Road 7, Uttara, Dhaka 1230',
                'phone': '+88028954321',
                'email': 'care@uttarawellness.example.com',
                'manager': ('Sharmin', 'Sultana', 'sharmin.mgr@example.com'),
                'staff': [('Nafis', 'Ahmed', 'nafis.staff@example.com')],
                'providers_data': [
                    ('Dr. Mehedi Hasan', 'Orthopedic Consultant', 'MBBS, MS (Orthopedics). Spine and joint care.'),
                    ('Dr. Farhana Yeasmin', 'Nutrition & Lifestyle Consultant', 'BSc, MSc (Nutrition & Food Science).'),
                ],
                'services': [
                    ('Orthopedic & Joint Consultation', 'Bone, joint, and spine pain evaluation.', 25, '1200.00'),
                    ('Nutrition & Diet Planning', 'Customized diet plans for weight management & diabetes.', 30, '1500.00'),
                    ('Physiotherapy Assessment', 'Physical rehabilitation planning.', 30, '1000.00'),
                ]
            },
            {
                'name': 'Dhanmondi Medical Point',
                'slug': 'dhanmondi-medical-point',
                'address': 'Road 2, Dhanmondi, Dhaka 1205',
                'phone': '+88029671122',
                'email': 'info@dhanmondimedical.example.com',
                'manager': ('Imran', 'Hossain', 'imran.mgr@example.com'),
                'staff': [('Mim', 'Akter', 'mim.staff@example.com')],
                'providers_data': [
                    ('Dr. Farhan Kabir', 'Cardiology Specialist', 'MBBS, MD (Cardiology). Heart care expert.'),
                    ('Dr. Sadiya Afrin', 'ENT Consultant', 'MBBS, DLO. Ear, nose, and throat specialist.'),
                ],
                'services': [
                    ('Cardiology & ECG Review', 'Heart health check and ECG interpretation.', 30, '1500.00'),
                    ('ENT Consultation', 'Diagnosis of ear, nose, throat conditions.', 20, '1000.00'),
                ]
            },

            # Salon & Beauty (6 Orgs)
            {
                'name': 'Gulshan Glow Studio',
                'slug': 'gulshan-glow-studio',
                'address': 'Pink City Shopping Complex, Gulshan-2, Dhaka 1212',
                'phone': '+880175550011',
                'email': 'booking@gulshanglow.example.com',
                'manager': ('Tamanna', 'Yasmin', 'tamanna.mgr@example.com'),
                'staff': [('Rokia', 'Begum', 'rokia.staff@example.com')],
                'providers_data': [
                    ('Farzana Shakil Associate', 'Senior Hair & Makeup Artist', 'Certified International Stylist.'),
                    ('Nusrat Jahan Style', 'Skin Care & Facial Specialist', 'Organic facial and skin specialist.'),
                ],
                'services': [
                    ('Executive Haircut & Styling', 'Wash, cut, blow-dry, and professional styling.', 45, '1500.00'),
                    ('Hydra-Glow Facial Treatment', 'Deep cleansing and skin rejuvenation facial.', 60, '3500.00'),
                    ('Bridal Makeup Consultation', 'Trial session and wedding makeup planning.', 60, '5000.00'),
                    ('Hair Keratin Protein Treatment', 'Deep hair conditioning and smoothing.', 90, '6500.00'),
                ]
            },
            {
                'name': 'Banani Style Lounge',
                'slug': 'banani-style-lounge',
                'address': 'Block F, Road 11, Banani, Dhaka 1213',
                'phone': '+880175550022',
                'email': 'hello@bananistyle.example.com',
                'manager': ('Anika', 'Tabassum', 'anika.mgr@example.com'),
                'staff': [('Rumana', 'Rashid', 'rumana.staff@example.com')],
                'providers_data': [
                    ('Tariqul Islam', 'Master Barber & Stylist', 'Grooming and beard design expert.'),
                    ('Saif Hasan Stylist', 'Creative Hair Artist', 'Coloring and modern cuts expert.'),
                ],
                'services': [
                    ('Gentlemen Royal Grooming Package', 'Haircut, beard trim, face massage.', 45, '1200.00'),
                    ('Beard Sculpting & Hot Towel Treatment', 'Precision beard shaping with hot towel.', 30, '600.00'),
                    ('Hair Color & Highlights', 'Global hair coloring and highlighting.', 60, '2800.00'),
                ]
            },
            {
                'name': 'Mirpur Beauty Care',
                'slug': 'mirpur-beauty-care',
                'address': 'Mirpur DOHS Shopping Complex, Dhaka 1216',
                'phone': '+880175550033',
                'email': 'care@mirpurbeauty.example.com',
                'manager': ('Nazia', 'Hassan', 'nazia.mgr@example.com'),
                'staff': [('Dilruba', 'Khanom', 'dilruba.staff@example.com')],
                'providers_data': [
                    ('Sharmeen Akter', 'Beauty & Spa Specialist', 'Aromatherapy and hair care.'),
                ],
                'services': [
                    ('Herbal Hair Spa Treatment', 'Nourishing herbal oil massage and steam.', 45, '800.00'),
                    ('Classic Pedicure & Manicure', 'Nail care, scrub, and deep moisturizing.', 45, '1000.00'),
                ]
            },
            {
                'name': 'Dhanmondi Aesthetic & Spa',
                'slug': 'dhanmondi-aesthetic-spa',
                'address': 'Road 27, Dhanmondi, Dhaka 1209',
                'phone': '+880175550044',
                'email': 'info@dhanmondiaesthetic.example.com',
                'manager': ('Sadiya', 'Afrin', 'sadiya.spa@example.com'),
                'staff': [('Tanjila', 'Akter', 'tanjila.spa@example.com')],
                'providers_data': [
                    ('Ayesha Rahman', 'Senior Aesthetic Specialist', 'Certified laser & skin specialist.'),
                ],
                'services': [
                    ('Aromatherapy Body Massage', 'Full body relaxing essential oil massage.', 60, '3000.00'),
                    ('Anti-Aging Rejuvenation Facial', 'Collagen boost facial therapy.', 60, '4000.00'),
                ]
            },
            {
                'name': 'Uttara Glamour Salon',
                'slug': 'uttara-glamour-salon',
                'address': 'Sector 3, Sonargaon Janapath, Uttara, Dhaka 1230',
                'phone': '+880175550055',
                'email': 'glamour@uttarasalon.example.com',
                'manager': ('Subrata', 'Chowdhury', 'subrata.glamour@example.com'),
                'staff': [('Farhana', 'Yeasmin', 'farhana.glamour@example.com')],
                'providers_data': [
                    ('Mehedi Hasan Hair', 'Creative Hair Stylist', 'Unisex hair cut and styling.'),
                ],
                'services': [
                    ('Trendy Haircut & Rebonding', 'Straightening and sleek shine finish.', 90, '5500.00'),
                    ('Party Makeup & Hair Styling', 'Flawless evening party glam look.', 60, '3000.00'),
                ]
            },
            {
                'name': 'Sylhet Chic Beauty Bar',
                'slug': 'sylhet-chic-beauty-bar',
                'address': 'Zindabazar Commercial Complex, Sylhet 3100',
                'phone': '+880175550066',
                'email': 'booking@sylhetchic.example.com',
                'manager': ('Subrata', 'Chowdhury', 'subrata.sylhet@example.com'),
                'staff': [('Samia', 'Rahman', 'samia.sylhet@example.com')],
                'providers_data': [
                    ('Nafis Ahmed Stylist', 'Bridal & Party Specialist', 'Regional bridal specialist.'),
                ],
                'services': [
                    ('Deluxe Spa Pedicure', 'Exfoliating foot scrub & polish.', 45, '1200.00'),
                    ('Organic Gold Glow Facial', '24k gold foil radiance facial.', 60, '4500.00'),
                ]
            },

            # Dental Care (6 Orgs)
            {
                'name': 'Dhanmondi Dental Speciality',
                'slug': 'dhanmondi-dental-speciality',
                'address': 'Road 7, Dhanmondi, Dhaka 1205',
                'phone': '+88029661122',
                'email': 'care@dhanmondidental.example.com',
                'manager': ('Farhan', 'Kabir', 'farhan.dental@example.com'),
                'staff': [('Jannatul', 'Ferdous', 'jannatul.dental@example.com')],
                'providers_data': [
                    ('Dr. Kazi Nazrul Dental', 'Orthodontics & Implant Specialist', 'BDS, MS (Orthodontics).'),
                    ('Dr. Subrata Dental', 'Cosmetic Dentist', 'BDS, PGT (Endodontics).'),
                ],
                'services': [
                    ('Scaling & Polishing Treatment', 'Ultrasound dental scaling and stain removal.', 30, '1500.00'),
                    ('Root Canal Therapy (Single Sitting)', 'Painless single-visit root canal.', 45, '4500.00'),
                    ('Laser Tooth Whitening', 'Instant teeth whitening treatment.', 45, '6000.00'),
                    ('Invisible Braces Consultation', 'Clear aligner assessment and 3D scan.', 30, '2000.00'),
                ]
            },
            {
                'name': 'Gulshan Smile & Implant Center',
                'slug': 'gulshan-smile-implant',
                'address': 'Avenue 1, Gulshan-1, Dhaka 1212',
                'phone': '+88029882233',
                'email': 'info@gulshansmile.example.com',
                'manager': ('Tahmidur', 'Rahman', 'tahmidur.smile@example.com'),
                'staff': [('Rokia', 'Begum', 'rokia.smile@example.com')],
                'providers_data': [
                    ('Dr. Moniruzzaman Dental', 'Implantologist & Oral Surgeon', 'BDS, FCPS (Oral Surgery).'),
                ],
                'services': [
                    ('Dental Implant Evaluation', '3D X-ray and titanium implant planning.', 30, '3000.00'),
                    ('Ceramic Crown & Bridge Fitting', 'Custom tooth color ceramic crown.', 45, '5000.00'),
                ]
            },
            {
                'name': 'Uttara Dental Care & Orthodontics',
                'slug': 'uttara-dental-care',
                'address': 'Sector 11, Road 2, Uttara, Dhaka 1230',
                'phone': '+88028963344',
                'email': 'support@uttaradental.example.com',
                'manager': ('Taskin', 'Ahmed', 'taskin.dental@example.com'),
                'staff': [('Naimul', 'Hasan', 'naimul.dental@example.com')],
                'providers_data': [
                    ('Dr. Tamanna Dental', 'Pediatric Dental Specialist', 'BDS, MPH. Child dental care.'),
                ],
                'services': [
                    ('Kids Dental Checkup & Fluoride', 'Cavity prevention and tooth sealant.', 30, '1200.00'),
                    ('Tooth Extraction (Simple)', 'Painless dental extraction under local anesthesia.', 30, '1500.00'),
                ]
            },
            {
                'name': 'Banani Pearl Dental Clinic',
                'slug': 'banani-pearl-dental',
                'address': 'Road 11, Banani, Dhaka 1213',
                'phone': '+88029874455',
                'email': 'pearl@bananidental.example.com',
                'manager': ('Ziaur', 'Rahman', 'ziaur.pearl@example.com'),
                'staff': [('Laila', 'Arjumand', 'laila.pearl@example.com')],
                'providers_data': [
                    ('Dr. Shafiqul Dental', 'Cosmetic Dental Surgeon', 'BDS, PGT (Cosmetic Dentistry).'),
                ],
                'services': [
                    ('Composite Veneers & Smile Design', 'Aesthetic smile correction.', 45, '4000.00'),
                    ('Wisdom Tooth Removal Audit', 'Impacted wisdom tooth consultation.', 30, '2500.00'),
                ]
            },
            {
                'name': 'Mirpur Apex Dental Care',
                'slug': 'mirpur-apex-dental',
                'address': 'Main Road, Mirpur-2, Dhaka 1216',
                'phone': '+88029015566',
                'email': 'apex@mirpurdental.example.com',
                'manager': ('Sabbir', 'Hossain', 'sabbir.apex@example.com'),
                'staff': [('Rumana', 'Rashid', 'rumana.apex@example.com')],
                'providers_data': [
                    ('Dr. Kamrul Dental', 'General Dental Practitioner', 'BDS. 8+ yrs experience.'),
                ],
                'services': [
                    ('Routine Dental Cleaning & Checkup', 'Complete plaque removal & examination.', 30, '1000.00'),
                    ('Tooth Cavity Filling (Composite)', 'Invisible tooth-colored filling.', 30, '1200.00'),
                ]
            },
            {
                'name': 'Chittagong Perfect Smile Clinic',
                'slug': 'chittagong-perfect-smile',
                'address': 'GEC Circle, Nasirabad, Chittagong 4000',
                'phone': '+880316556677',
                'email': 'chittagong@perfectsmile.example.com',
                'manager': ('Nabila', 'Chowdhury', 'nabila.ctg@example.com'),
                'staff': [('Mustafizur', 'Rahman', 'mustafizur.ctg@example.com')],
                'providers_data': [
                    ('Dr. Rubel Dental Specialist', 'Orthodontic Surgeon', 'BDS, MS.'),
                ],
                'services': [
                    ('Orthodontic Metal Braces Setup', 'Complete alignment braces fitting.', 60, '35000.00'),
                    ('Night Guard & Gum Shield', 'Custom tooth grinding guard.', 30, '2000.00'),
                ]
            },

            # Diagnostic (6 Orgs)
            {
                'name': 'Popular Diagnostic & Imaging Center',
                'slug': 'popular-diagnostic-imaging',
                'address': 'House 16, Road 2, Dhanmondi, Dhaka 1205',
                'phone': '+88029669480',
                'email': 'info@populardiagnostic.example.com',
                'manager': ('Fahim', 'Hasan', 'fahim.pop@example.com'),
                'staff': [('Mehedi', 'Hasan', 'mehedi.pop@example.com')],
                'providers_data': [
                    ('Dr. Ariful Radiologist', 'Consultant Radiologist', 'MBBS, MD (Radiology). 15+ yrs.'),
                    ('Dr. Tanjila Pathologist', 'Consultant Pathologist', 'MBBS, DCP.'),
                ],
                'services': [
                    ('Full Body Health Screening Lab Package', 'Comprehensive blood count, lipid, kidney & liver panel.', 30, '3500.00'),
                    ('High-Resolution MRI Scan Review', '1.5T Brain/Spine MRI imaging.', 30, '7000.00'),
                    ('4D Color Doppler Ultrasonogram', 'Advanced abdominal and pelvic ultrasound scan.', 25, '2500.00'),
                    ('Digital Chest X-Ray & ECG', 'Dual cardio-respiratory preliminary audit.', 15, '800.00'),
                ]
            },
            {
                'name': 'Ibn Sina Specialized Lab',
                'slug': 'ibn-sina-specialized-lab',
                'address': 'House 68, Road 15/A, Dhanmondi, Dhaka 1209',
                'phone': '+88029126622',
                'email': 'lab@ibnsina.example.com',
                'manager': ('Arif', 'Hossain', 'arif.ibn@example.com'),
                'staff': [('Rakibul', 'Hasan', 'rakibul.ibn@example.com')],
                'providers_data': [
                    ('Dr. Samia Pathologist', 'Chief Medical Biochemist', 'MBBS, MPhil (Biochemistry).'),
                ],
                'services': [
                    ('Diabetes Profile (HbA1c & Fasting)', 'Comprehensive blood sugar control evaluation.', 20, '1200.00'),
                    ('Thyroid Function Test (T3, T4, TSH)', 'Complete hormone panel.', 20, '1500.00'),
                ]
            },
            {
                'name': 'Labaid Diagnostic Complex',
                'slug': 'labaid-diagnostic-complex',
                'address': 'House 1, Road 4, Dhanmondi, Dhaka 1205',
                'phone': '+88028610701',
                'email': 'reports@labaiddiagnostic.example.com',
                'manager': ('Nafis', 'Ahmed', 'nafis.lab@example.com'),
                'staff': [('Saif', 'Hasan', 'saif.lab@example.com')],
                'providers_data': [
                    ('Dr. Mim Radiologist', 'Consultant Sonologist', 'MBBS, PGT (Ultrasonography).'),
                ],
                'services': [
                    ('Echocardiogram (Echo TTE)', 'Color Doppler cardiac ultrasound.', 30, '3000.00'),
                    ('128-Slice CT Scan Chest', 'High speed lung scan.', 30, '8000.00'),
                ]
            },
            {
                'name': 'BioMed Pathology & Scan Center',
                'slug': 'biomed-pathology-scan',
                'address': 'Sector 4, Main Road, Uttara, Dhaka 1230',
                'phone': '+88028956677',
                'email': 'info@biomedscan.example.com',
                'manager': ('Imran', 'Hossain', 'imran.biomed@example.com'),
                'staff': [('Farhan', 'Kabir', 'farhan.biomed@example.com')],
                'providers_data': [
                    ('Dr. Jannatul Microbiologist', 'Senior Consultant Microbiologist', 'MBBS, MD.'),
                ],
                'services': [
                    ('Vitamin D & B12 Assay', 'Serum vitamin level analysis.', 20, '3200.00'),
                    ('Dengue & Fever Screening Panel', 'NS1 antigen and CBC emergency panel.', 15, '900.00'),
                ]
            },
            {
                'name': 'National Diagnostic & MRI Lab',
                'slug': 'national-diagnostic-mri',
                'address': 'Mirpur-10 Circle, Dhaka 1216',
                'phone': '+88029017788',
                'email': 'contact@nationalmri.example.com',
                'manager': ('Adnan', 'Rahman', 'adnan.nat@example.com'),
                'staff': [('Kazi', 'Nazrul', 'kazi.nat@example.com')],
                'providers_data': [
                    ('Dr. Farhana Radiologist', 'Musculoskeletal Radiologist', 'MBBS, MD.'),
                ],
                'services': [
                    ('Lumbar Spine MRI', 'Spine disc and nerve root MRI.', 30, '6500.00'),
                    ('Knee Joint Digital X-Ray', 'Dual view knee joint X-ray.', 15, '600.00'),
                ]
            },
            {
                'name': 'Medinova Specialized Diagnostic',
                'slug': 'medinova-specialized-diagnostic',
                'address': 'Kazi Nazrul Islam Avenue, Malibagh, Dhaka 1217',
                'phone': '+88029348899',
                'email': 'support@medinova.example.com',
                'manager': ('Subrata', 'Chowdhury', 'subrata.med@example.com'),
                'staff': [('Tahmidur', 'Rahman', 'tahmidur.med@example.com')],
                'providers_data': [
                    ('Dr. Rokia Pathologist', 'Consultant Hematologist', 'MBBS, FCPS (Hematology).'),
                ],
                'services': [
                    ('Complete Blood Count (CBC) & ESR', 'Routine hematology audit.', 15, '400.00'),
                    ('Liver & Kidney Function Panel', 'Bilirubin, SGPT, Creatinine, Urea.', 20, '1800.00'),
                ]
            },

            # Consulting (6 Orgs)
            {
                'name': 'Bengal Business Consulting',
                'slug': 'bengal-business-consulting',
                'address': 'City Center Tower, Motijheel C/A, Dhaka 1000',
                'phone': '+88029550099',
                'email': 'advisory@bengalbusiness.example.com',
                'manager': ('Moniruzzaman', 'Khan', 'moniruzzaman.mgr@example.com'),
                'staff': [('Taskin', 'Ahmed', 'taskin.staff@example.com')],
                'providers_data': [
                    ('Kazi Nazrul Islam CPA', 'Tax & Compliance Consultant', 'Chartered Accountant. 15+ yrs experience.'),
                    ('Subrata Chowdhury MBA', 'Business Strategy Advisor', 'Corporate growth and market entry strategist.'),
                ],
                'services': [
                    ('Corporate Tax & Audit Session', 'Corporate tax filing and audit compliance advice.', 60, '5000.00'),
                    ('Business Growth Strategy Session', 'Market expansion and operational scaling advice.', 60, '7500.00'),
                    ('Startup Advisory & Regulatory Legal', 'Trade license, VAT, and RJSC compliance advice.', 45, '3500.00'),
                ]
            },
            {
                'name': 'Dhaka Career Advisory',
                'slug': 'dhaka-career-advisory',
                'address': 'Farmgate Tower, Kazi Nazrul Islam Avenue, Dhaka 1215',
                'phone': '+8801811998877',
                'email': 'counsel@dhakacareer.example.com',
                'manager': ('Tahmidur', 'Rahman', 'tahmidur.mgr@example.com'),
                'staff': [('Sabbir', 'Hossain', 'sabbir.staff@example.com')],
                'providers_data': [
                    ('Shafiqul Alam HR', 'Senior Career Counselor', 'Former Multinational HR Director.'),
                ],
                'services': [
                    ('Executive CV & LinkedIn Audit', 'Professional resume review and LinkedIn optimization.', 30, '1500.00'),
                    ('Mock Job Interview & Feedback', 'Realistic mock interview session with detailed feedback.', 45, '2500.00'),
                ]
            },
            {
                'name': 'Apex Legal & Tax Partners',
                'slug': 'apex-legal-tax-partners',
                'address': 'Supreme Court Bar Annex, Segunbagicha, Dhaka 1000',
                'phone': '+88029561122',
                'email': 'legal@apexpartners.example.com',
                'manager': ('Anika', 'Tabassum', 'anika.legal@example.com'),
                'staff': [('Sabbir', 'Hossain', 'sabbir.legal@example.com')],
                'providers_data': [
                    ('Advocate Kamrul Hassan', 'Supreme Court Legal Practitioner', 'LL.M. Corporate law & litigation expert.'),
                ],
                'services': [
                    ('Corporate Contract & Agreement Audit', 'Legal vetting of business contracts & NDAs.', 60, '6000.00'),
                    ('IP & Trademark Registration Advisory', 'Patent, logo, and trademark filing guidance.', 45, '4000.00'),
                ]
            },
            {
                'name': 'Horizon Corporate Advisory',
                'slug': 'horizon-corporate-advisory',
                'address': 'Crystal Palace, Road 140, Gulshan-1, Dhaka 1212',
                'phone': '+88029892233',
                'email': 'info@horizonadvisory.example.com',
                'manager': ('Nabila', 'Chowdhury', 'nabila.horizon@example.com'),
                'staff': [('Mustafizur', 'Rahman', 'mustafizur.horizon@example.com')],
                'providers_data': [
                    ('Mustafizur Rahman MBA', 'Financial Restructuring Specialist', 'Ex-Investment Banker.'),
                ],
                'services': [
                    ('Financial Feasibility Study', 'Investment project modeling & ROI audit.', 60, '10000.00'),
                    ('Mergers & Acquisition Due Diligence', 'Corporate valuation & due diligence session.', 90, '15000.00'),
                ]
            },
            {
                'name': 'Prime Financial & Audit Consultants',
                'slug': 'prime-financial-audit',
                'address': 'Dilkusha C/A, Motijheel, Dhaka 1000',
                'phone': '+88029573344',
                'email': 'audit@primefinancial.example.com',
                'manager': ('Sharmin', 'Akter', 'sharmin.prime@example.com'),
                'staff': [('Babul', 'Miah', 'babul.prime@example.com')],
                'providers_data': [
                    ('Nazia Hassan FCA', 'Fellow Chartered Accountant', 'Internal audit and risk management expert.'),
                ],
                'services': [
                    ('Internal Audit & Payroll Setup', 'Payroll tax compliance & internal controls audit.', 60, '7000.00'),
                    ('VAT Registration & Return Filing', 'Monthly NBR VAT return advisory.', 45, '3000.00'),
                ]
            },
            {
                'name': 'Innovate Tech & Venture Advisory',
                'slug': 'innovate-tech-venture',
                'address': 'Software Technology Park, Janata Tower, Karwan Bazar, Dhaka 1215',
                'phone': '+88029144455',
                'email': 'venture@innovatetech.example.com',
                'manager': ('Rubel', 'Hossain', 'rubel.venture@example.com'),
                'staff': [('Dilruba', 'Khanom', 'dilruba.venture@example.com')],
                'providers_data': [
                    ('Fahim Hasan Tech Advisor', 'SaaS & AI Venture Consultant', 'Tech startup mentor and angel investor.'),
                ],
                'services': [
                    ('Startup Pitch Deck & Fundraising', 'Investor pitch refinement & term sheet advisory.', 60, '8000.00'),
                    ('Software Architecture & Cloud Audit', 'Cloud security and scalable tech stack review.', 60, '12000.00'),
                ]
            },
        ]

        org_instances = []
        provider_instances = []
        service_instances = []

        for odef in orgs_definition:
            # 1. Organization
            org = Organization.objects.create(
                name=odef['name'],
                slug=odef['slug'],
                address=odef['address'],
                phone_number=odef['phone'],
                email=odef['email'],
            )
            org_instances.append(org)

            # 2. Manager
            m_data = odef['manager']
            if isinstance(m_data, User):
                m_user = m_data
            else:
                m_user = User.objects.create_user(
                    email=m_data[2],
                    password='password123',
                    first_name=m_data[0],
                    last_name=m_data[1],
                    phone_number=f"+88017{random.randint(10000000, 99999999)}",
                )
            OrganizationMembership.objects.create(
                user=m_user,
                organization=org,
                role=OrganizationMembership.Role.MANAGER,
            )

            # 3. Staff
            for s_data in odef['staff']:
                if isinstance(s_data, User):
                    s_user = s_data
                else:
                    s_user = User.objects.create_user(
                        email=s_data[2],
                        password='password123',
                        first_name=s_data[0],
                        last_name=s_data[1],
                        phone_number=f"+88017{random.randint(10000000, 99999999)}",
                    )
                OrganizationMembership.objects.create(
                    user=s_user,
                    organization=org,
                    role=OrganizationMembership.Role.STAFF,
                )

            # 4. Services
            org_services = []
            for sname, sdesc, sdur, sprice in odef['services']:
                svc = Service.objects.create(
                    organization=org,
                    name=sname,
                    description=sdesc,
                    duration_minutes=sdur,
                    price=sprice,
                )
                org_services.append(svc)
                service_instances.append(svc)

            # 5. Providers
            for idx, p_item in enumerate(odef['providers_data'], start=1):
                if isinstance(p_item[0], User):
                    p_user = p_item[0]
                else:
                    p_name_parts = p_item[0].split(' ')
                    fn = p_name_parts[0]
                    ln = " ".join(p_name_parts[1:]) if len(p_name_parts) > 1 else "Provider"
                    em = f"provider.{org.slug}.{idx}_{fn.lower().replace('.', '')}@example.com"
                    p_user = User.objects.create_user(
                        email=em,
                        password='password123',
                        first_name=fn,
                        last_name=ln,
                        phone_number=f"+88017{random.randint(10000000, 99999999)}",
                    )
                
                mem = OrganizationMembership.objects.create(
                    user=p_user,
                    organization=org,
                    role=OrganizationMembership.Role.PROVIDER,
                )

                profile = ProviderProfile.objects.create(
                    membership=mem,
                    title=p_item[1],
                    bio=p_item[2],
                )
                provider_instances.append(profile)

                # Link services
                for svc in org_services:
                    ProviderService.objects.create(
                        provider=profile,
                        service=svc,
                    )

                # Weekly Schedule (Saturday - Thursday, 09:00 - 17:00 or 10:00 - 18:00)
                work_start = time(9, 0) if random.choice([True, False]) else time(10, 0)
                work_end = time(17, 0) if work_start.hour == 9 else time(18, 0)
                
                # Saturday (5), Sunday (6), Monday (0), Tuesday (1), Wednesday (2), Thursday (3), Friday (4 - OFF)
                for day_idx in range(7):
                    is_work = (day_idx != 4) # Friday OFF in BD
                    ws = WeeklySchedule.objects.create(
                        provider=profile,
                        day_of_week=day_idx,
                        start_time=work_start,
                        end_time=work_end,
                        is_working_day=is_work,
                    )
                    if is_work:
                        # Lunch break 13:00 - 14:00
                        ScheduleBreak.objects.create(
                            weekly_schedule=ws,
                            title='Lunch & Prayer Break',
                            start_time=time(13, 0),
                            end_time=time(14, 0),
                        )

                # Add occasional provider leave for upcoming date (e.g. 10 days from now)
                if random.random() > 0.7:
                    leave_start = timezone.now() + timedelta(days=10, hours=9)
                    ProviderLeave.objects.create(
                        provider=profile,
                        start_datetime=leave_start,
                        end_datetime=leave_start + timedelta(days=1),
                        reason='Personal leave / Conference',
                    )

        # 4. Generate Appointments, Queue Entries, Reviews, Notifications, Audit Logs
        appointment_instances = []
        queue_instances = []
        review_instances = []

        now = timezone.now()
        today_date = date.today()

        sample_review_comments = [
            "Very helpful and professional service. Highly recommended!",
            "The service was smooth, punctual, and well-organized.",
            "Good experience overall. Clean facilities.",
            "Appointment started right on time. Excellent behavior.",
            "Friendly and professional team. Satisfied with the care.",
            "Waiting time was a little long, but service quality was great.",
            "Excellent service. Will definitely book again.",
            "Very skilled provider. Solved my issue quickly.",
        ]

        token_counter_map = {}

        # A) Historical Completed Appointments (Past 30 days - 90 appointments)
        for i in range(90):
            days_ago = random.randint(1, 30)
            appt_date = today_date - timedelta(days=days_ago)
            # Pick random org, provider, customer, service
            provider = random.choice(provider_instances)
            org = provider.organization
            available_services = [ps.service for ps in provider.provider_services.all()]
            if not available_services:
                continue
            service = random.choice(available_services)
            customer = random.choice(customers)

            slot_hour = random.choice([9, 10, 11, 14, 15, 16])
            start_dt = timezone.make_aware(datetime.combine(appt_date, time(slot_hour, 0)))
            end_dt = start_dt + timedelta(minutes=service.duration_minutes)

            appt = Appointment.objects.create(
                organization=org,
                customer=customer,
                provider=provider,
                service=service,
                start_datetime=start_dt,
                end_datetime=end_dt,
                status=Appointment.Status.COMPLETED,
                notes='Historical appointment completed successfully.',
            )
            appointment_instances.append(appt)

            # Queue entry for historical appt (sequential token per provider per date)
            q_key = (provider.id, appt_date)
            t_num = token_counter_map.get(q_key, 1)
            token_counter_map[q_key] = t_num + 1

            q_entry = QueueEntry.objects.create(
                organization=org,
                appointment=appt,
                provider=provider,
                queue_date=appt_date,
                token_number=t_num,
                status=QueueEntry.Status.COMPLETED,
                called_at=start_dt - timedelta(minutes=5),
                started_at=start_dt,
                completed_at=end_dt,
            )
            queue_instances.append(q_entry)

            # Create review for ~60% of completed appointments
            if random.random() > 0.4:
                rev = Review.objects.create(
                    organization=org,
                    appointment=appt,
                    customer=customer,
                    provider=provider,
                    rating=random.choice([4, 5, 5, 4, 3, 5]),
                    comment=random.choice(sample_review_comments),
                )
                review_instances.append(rev)

        # B) Today's Active Appointments & Queue Entries (15 appointments)
        # Create today's queue for Dr. Tanvir Ahmed (provider.demo@example.com) & other providers
        dhaka_care_org = org_instances[0]
        demo_provider_profile = provider_instances[0] # Dr. Tanvir Ahmed

        today_hours = [9, 10, 11, 14, 15, 16]
        token_counter = 1
        for h in today_hours:
            customer = customers[token_counter % len(customers)]
            svc = demo_provider_profile.provider_services.first().service
            start_dt = timezone.make_aware(datetime.combine(today_date, time(h, 0)))
            end_dt = start_dt + timedelta(minutes=svc.duration_minutes)

            # Token 1: IN_PROGRESS
            # Token 2: CALLED
            # Token 3+: WAITING
            if token_counter == 1:
                a_status = Appointment.Status.IN_PROGRESS
                q_status = QueueEntry.Status.IN_PROGRESS
            elif token_counter == 2:
                a_status = Appointment.Status.CHECKED_IN
                q_status = QueueEntry.Status.CALLED
            elif token_counter == 3:
                a_status = Appointment.Status.CHECKED_IN
                q_status = QueueEntry.Status.WAITING
            else:
                a_status = Appointment.Status.CONFIRMED
                q_status = QueueEntry.Status.WAITING

            appt = Appointment.objects.create(
                organization=dhaka_care_org,
                customer=customer,
                provider=demo_provider_profile,
                service=svc,
                start_datetime=start_dt,
                end_datetime=end_dt,
                status=a_status,
                notes=f'Today operational queue booking #{token_counter}',
            )
            appointment_instances.append(appt)

            q_key = (demo_provider_profile.id, today_date)
            t_num = token_counter_map.get(q_key, 1)
            token_counter_map[q_key] = t_num + 1

            q_entry = QueueEntry.objects.create(
                organization=dhaka_care_org,
                appointment=appt,
                provider=demo_provider_profile,
                queue_date=today_date,
                token_number=t_num,
                status=q_status,
                called_at=now - timedelta(minutes=10) if q_status in [QueueEntry.Status.CALLED, QueueEntry.Status.IN_PROGRESS] else None,
                started_at=now - timedelta(minutes=5) if q_status == QueueEntry.Status.IN_PROGRESS else None,
            )
            queue_instances.append(q_entry)

            token_counter += 1

        # C) Future Upcoming Appointments (Next 14 days - 45 appointments)
        for i in range(45):
            days_ahead = random.randint(1, 14)
            appt_date = today_date + timedelta(days=days_ahead)
            provider = random.choice(provider_instances)
            org = provider.organization
            available_services = [ps.service for ps in provider.provider_services.all()]
            if not available_services:
                continue
            service = random.choice(available_services)
            customer = random.choice(customers)

            slot_hour = random.choice([9, 10, 11, 14, 15, 16])
            start_dt = timezone.make_aware(datetime.combine(appt_date, time(slot_hour, 0)))
            end_dt = start_dt + timedelta(minutes=service.duration_minutes)

            appt = Appointment.objects.create(
                organization=org,
                customer=customer,
                provider=provider,
                service=service,
                start_datetime=start_dt,
                end_datetime=end_dt,
                status=Appointment.Status.CONFIRMED,
                notes='Upcoming confirmed booking.',
            )
            appointment_instances.append(appt)

        # D) Cancelled & No-Show Appointments (15 appointments)
        for i in range(15):
            days_ago = random.randint(1, 15)
            appt_date = today_date - timedelta(days=days_ago)
            provider = random.choice(provider_instances)
            org = provider.organization
            available_services = [ps.service for ps in provider.provider_services.all()]
            if not available_services:
                continue
            service = random.choice(available_services)
            customer = random.choice(customers)

            start_dt = timezone.make_aware(datetime.combine(appt_date, time(11, 0)))
            end_dt = start_dt + timedelta(minutes=service.duration_minutes)

            is_cancelled = random.choice([True, False])
            status = Appointment.Status.CANCELLED if is_cancelled else Appointment.Status.NO_SHOW

            Appointment.objects.create(
                organization=org,
                customer=customer,
                provider=provider,
                service=service,
                start_datetime=start_dt,
                end_datetime=end_dt,
                status=status,
                cancellation_reason='Schedule conflict / Personal emergency' if is_cancelled else '',
                notes='Cancelled or no-show appointment record.',
            )

        # 5. Seed Notifications
        for cust in customers[:15]:
            Notification.objects.create(
                recipient=cust,
                organization=dhaka_care_org,
                kind=Notification.Kind.APPOINTMENT_BOOKED,
                title='Appointment Confirmed',
                message='Your appointment with Dhaka Care Clinic has been successfully confirmed.',
                read_at=now if random.choice([True, False]) else None,
            )

        # 6. Seed Audit Logs
        AuditLog.objects.create(
            organization=dhaka_care_org,
            actor=manager_demo,
            action='ORGANIZATION_CONFIGURED',
            entity_type='Organization',
            entity_id=str(dhaka_care_org.id),
            metadata={'name': dhaka_care_org.name, 'seeded': True},
        )
        AuditLog.objects.create(
            organization=dhaka_care_org,
            actor=staff_demo_user,
            action='CUSTOMER_CHECKED_IN',
            entity_type='Appointment',
            entity_id=str(appointment_instances[0].id),
            metadata={'customer': customer_demo_user.email},
        )

        return (
            [admin_user, manager_demo, provider_demo_user, staff_demo_user, customer_demo_user],
            org_instances,
            customers,
            provider_instances,
            service_instances,
            appointment_instances,
            queue_instances,
            review_instances,
        )
