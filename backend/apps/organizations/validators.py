import os
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx']
MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


def validate_document_file(file):
    """
    Validates uploaded document files:
    - Presence of file
    - Max file size (10 MB)
    - File extension (.pdf, .png, .jpg, .jpeg, .doc, .docx)
    """
    if not file:
        raise ValidationError(_("No file was uploaded."))

    ext = os.path.splitext(file.name)[1].lower()
    if ext not in ALLOWED_DOCUMENT_EXTENSIONS:
        raise ValidationError(
            _("Unsupported file format. Allowed extensions: %(exts)s"),
            params={'exts': ', '.join(ALLOWED_DOCUMENT_EXTENSIONS)}
        )

    if file.size > MAX_DOCUMENT_SIZE_BYTES:
        raise ValidationError(
            _("File size exceeds the 10 MB limit.")
        )
