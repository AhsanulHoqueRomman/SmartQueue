"""Deterministic fictional portfolio professionals; exact emails feed reset ownership.

Service indexes refer to the existing, ordered service definitions of each org.
Charges are source overrides only. None intentionally demonstrates base fallback.
"""
from datetime import time

# (first name, last name, email local part, designation, experience, service overrides)
PROFESSIONALS = {
    'dhaka-care-clinic': [
        ('Dr. Rashed', 'Mahin', 'rashed.mahin', 'General Medicine Consultant', 8, {0: '700.00', 1: None}),
        ('Dr. Nabila', 'Safa', 'nabila.safa', 'Dermatology Consultant', 6, {2: '900.00'}),
        ('Dr. Fariha', 'Mubin', 'fariha.mubin', 'Pediatric Consultant', 9, {3: '1100.00'}),
        ('Dr. Sayeed', 'Rafi', 'sayeed.rafi', 'Family Medicine Consultant', 7, {0: None, 3: '900.00'}),
        ('Dr. Ishrat', 'Nawar', 'ishrat.nawar', 'Skin & Follow-up Consultant', 11, {1: '600.00', 2: '1500.00'}),
    ],
    'careplus-diagnostic': [
        ('Dr. Tasnim', 'Reza', 'tasnim.reza', 'Pathology Consultant', 9, {0: '3200.00'}),
        ('Dr. Wafi', 'Sajid', 'wafi.sajid', 'Imaging Consultant', 7, {1: '6500.00'}),
        ('Nusaira', 'Mahin', 'nusaira.mahin', 'Diagnostic Laboratory Technologist', 5, {0: None}),
        ('Dr. Zahir', 'Mubin', 'zahir.mubin', 'Musculoskeletal Imaging Consultant', 12, {1: '7600.00'}),
        ('Dr. Lamiya', 'Rafi', 'lamiya.rafi', 'Diagnostic Medicine Consultant', 8, {0: '3800.00', 1: None}),
        ('Tanmay', 'Safa', 'tanmay.safa', 'MRI Technologist', 6, {1: '6800.00'}),
    ],
    'abc-legal-associates': [
        ('Adv. Nafisa', 'Mahin', 'nafisa.mahin', 'Corporate & Contract Associate', 6, {0: '13000.00', 1: None}),
        ('Adv. Sadman', 'Reza', 'sadman.reza', 'Property Law Consultant', 9, {2: '10500.00'}),
        ('Adv. Fariha', 'Rafi', 'fariha.rafi', 'Family & Civil Associate', 5, {3: '5000.00'}),
        ('Adv. Raihan', 'Mubin', 'raihan.mubin', 'Corporate & Property Counsel', 11, {0: None, 2: '14000.00'}),
        ('Adv. Tahira', 'Safa', 'tahira.safa', 'Contract & Civil Consultant', 7, {1: '7000.00', 3: None}),
        ('Adv. Aref', 'Nawar', 'aref.nawar', 'Property & Family Associate', 8, {2: None, 3: '6500.00'}),
    ],
    'glow-beauty-studio': [
        ('Samira', 'Mahin', 'samira.mahin', 'Hair Stylist', 6, {0: '3000.00'}),
        ('Nuzhat', 'Reza', 'nuzhat.reza', 'Skincare Specialist', 7, {1: '4000.00'}),
        ('Fahmida', 'Rafi', 'fahmida.rafi', 'Bridal Makeup Artist', 9, {2: '10500.00'}),
        ('Rumana', 'Mubin', 'rumana.mubin', 'Hair & Skin Specialist', 8, {0: None, 1: '4800.00'}),
        ('Sabiha', 'Nawar', 'sabiha.nawar', 'Makeup & Skincare Artist', 5, {1: None, 2: '11500.00'}),
        ('Orpita', 'Safa', 'orpita.safa', 'Bridal Hair & Makeup Stylist', 10, {0: '3900.00', 2: None}),
    ],
    'cooltech-service-center': [
        ('Rifat', 'Mahin', 'rifat.mahin', 'Laptop Repair Technician', 6, {0: '2200.00'}),
        ('Sajjad', 'Reza', 'sajjad.reza', 'Mobile Repair Technician', 5, {1: '1500.00'}),
        ('Amina', 'Rafi', 'amina.rafi', 'Air Conditioning Technician', 8, {2: '2700.00'}),
        ('Nayeem', 'Mubin', 'nayeem.mubin', 'Computer & Mobile Service Engineer', 9, {0: None, 1: '2000.00'}),
        ('Farid', 'Nawar', 'farid.nawar', 'Electronics & Appliance Technician', 7, {1: None, 2: '3300.00'}),
        ('Tanzim', 'Safa', 'tanzim.safa', 'Hardware & Appliance Diagnostics Engineer', 10, {0: '2800.00', 2: None}),
    ],
    'nexus-business-consulting': [
        ('Nashita', 'Mahin', 'nashita.mahin', 'Corporate Tax Consultant', 7, {0: '8500.00'}),
        ('Fahad', 'Reza', 'fahad.reza', 'Business Valuation Consultant', 9, {1: '13000.00'}),
        ('Raisa', 'Rafi', 'raisa.rafi', 'Cloud Security Consultant', 8, {2: '18000.00'}),
        ('Ashfaq', 'Mubin', 'ashfaq.mubin', 'Finance & Growth Advisor', 11, {0: None, 1: '16500.00'}),
        ('Nafiya', 'Nawar', 'nafiya.nawar', 'Technology Strategy Consultant', 6, {1: None, 2: '22000.00'}),
        ('Ruhul', 'Safa', 'ruhul.safa', 'Technology & Compliance Advisor', 10, {0: '11000.00', 2: None}),
    ],
    'green-line-express-counter': [
        ('Mahrin', 'Safa', 'mahrin.safa', 'Passenger Ticketing Associate', 4, {0: '130.00'}),
        ('Sakib', 'Mahin', 'sakib.mahin', 'Parcel Support Associate', 5, {1: '90.00'}),
        ('Nafisa', 'Reza', 'nafisa.reza', 'Passenger Service Coordinator', 7, {0: None}),
        ('Adib', 'Rafi', 'adib.rafi', 'Parcel Claims Coordinator', 6, {1: '120.00'}),
        ('Maliha', 'Mubin', 'maliha.mubin', 'Ticketing & Parcel Support Lead', 8, {0: '180.00', 1: None}),
        ('Rafiq', 'Nawar', 'rafiq.nawar', 'Passenger & Cargo Service Associate', 5, {0: '160.00', 1: '110.00'}),
    ],
}

# Opening hour, closing hour, weekly exceptions (Monday=0, Friday=4).
BUSINESS_HOURS = {
    'dhaka-care-clinic': (8, 20, {4: (9, 13)}),
    'careplus-diagnostic': (7, 21, {4: (8, 14)}),
    'abc-legal-associates': (9, 18, {4: None, 5: (10, 14)}),
    'glow-beauty-studio': (10, 21, {1: None, 4: (14, 21)}),
    'cooltech-service-center': (9, 20, {4: (14, 18)}),
    'nexus-business-consulting': (9, 18, {4: None, 5: None}),
    'green-line-express-counter': (6, 22, {4: (8, 20)}),
}

# Preserve existing identities; customize their source charges and role labels.
EXISTING_PROFESSIONALS = {
    'dhaka-care-clinic': [('Medicine & Skin Consultant', {0: '950.00', 1: None, 2: '1200.00', 3: None}),
                          ('Dermatology Specialist', {2: None})],
    'careplus-diagnostic': [('Consultant Radiologist', {0: '4000.00', 1: '8000.00'})],
    'abc-legal-associates': [('Corporate & Civil Counsel', {0: '18000.00', 1: '9000.00', 2: None, 3: '7000.00'})],
    'glow-beauty-studio': [('Master Hair & Makeup Stylist', {0: '4200.00', 1: None, 2: '14000.00'})],
    'cooltech-service-center': [('Chief Technical Specialist', {0: '3000.00', 1: '2200.00', 2: None})],
    'nexus-business-consulting': [('Managing Financial Advisor', {0: '12000.00', 1: '18000.00'})],
    'green-line-express-counter': [('Senior Counter Service Lead', {0: '200.00', 1: None})],
}


def enrich_definitions(definitions):
    for org in definitions:
        services = [service[1] for service in org['services']]
        for existing, (title, charges) in zip(org['providers_data'], EXISTING_PROFESSIONALS[org['slug']], strict=True):
            existing['title'] = title
            existing['custom_prices'] = {services[index]: value for index, value in charges.items()}
            existing['service_names'] = list(existing['custom_prices'])
            existing['bio'] = 'Fictional SmartQueue demo professional. ' + existing['bio']
            # Avoid depicting the pre-existing stylist as a real public figure.
            if org['slug'] == 'glow-beauty-studio':
                existing['user'] = ('Farzana', 'Nahar', existing['user'][2])
        domain = org['providers_data'][0]['user'][2].split('@')[1]
        for first, last, local, title, years, charges in PROFESSIONALS[org['slug']]:
            names = [services[index] for index in charges]
            org['providers_data'].append({
                'user': (first, last, f'{local}@{domain}'), 'title': title,
                'experience_years': years, 'profile_photo': '',
                'bio': f'Fictional demo professional offering {", ".join(names).lower()}.',
                'education': [{'degree': f'Demo training: {title}', 'institution': 'Fictional Professional Academy', 'year': '2018'}],
                'experience_history': [{'role': title, 'organization': org['name'], 'period': '2020–Present', 'description': 'Fictional portfolio experience.'}],
                'certifications': [{'name': 'Demo service practice qualification', 'issuer': 'Fictional Professional Academy', 'year': '2019'}],
                'specialties': names, 'service_names': names,
                'custom_prices': {services[index]: value for index, value in charges.items()},
            })
        opening, closing, exceptions = BUSINESS_HOURS[org['slug']]
        org['operating_hours'] = {day: exceptions.get(day, (opening, closing)) for day in range(7)}
    return definitions


def provider_day_hours(business_hours, provider_index, weekday):
    """Morning, middle and late shifts inside public hours, plus a rest day."""
    if business_hours is None or weekday == (provider_index + 2) % 7:
        return time(8), time(9), False
    opening, closing = business_hours
    if provider_index % 3 == 0:
        start, end = opening, min(opening + 6, closing)
    elif provider_index % 3 == 1:
        start, end = min(opening + 2, closing - 2), closing
    else:
        start, end = max(opening, closing - 6), closing
    return time(start), time(end), True
