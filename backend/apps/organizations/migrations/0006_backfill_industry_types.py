from django.db import migrations


def backfill_industry_types(apps, schema_editor):
    Organization = apps.get_model('organizations', 'Organization')
    for org in Organization.objects.all():
        name_lower = org.name.lower()
        if any(k in name_lower for k in ['beauty', 'salon', 'glow', 'style', 'spa', 'barber', 'chic']):
            org.industry_type = 'BEAUTY'
        elif any(k in name_lower for k in ['legal', 'law', 'associates', 'advocate']):
            org.industry_type = 'LEGAL'
        elif any(k in name_lower for k in ['tech', 'repair', 'cooltech', 'service center']):
            org.industry_type = 'REPAIR'
        elif any(k in name_lower for k in ['consulting', 'advisory', 'audit', 'financial']):
            org.industry_type = 'CONSULTING'
        elif any(k in name_lower for k in ['clinic', 'health', 'care', 'medical', 'dental', 'diagnostic', 'lab']):
            org.industry_type = 'HEALTHCARE'
        else:
            org.industry_type = 'OTHER'
        org.save(update_fields=['industry_type'])


class Migration(migrations.Migration):

    dependencies = [
        ('organizations', '0005_organization_cover_image_organization_description_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill_industry_types, reverse_code=migrations.RunPython.noop),
    ]
