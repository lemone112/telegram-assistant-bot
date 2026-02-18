| api_slug | title | type | is_writable | is_required | is_unique | is_multiselect | is_system |
| --- | --- | --- | --- | --- | --- | --- | --- |
| angellist | AngelList | text | True | False | False | False | True |
| birthday | Birthday | date | True | False | False | False | True |
| company | Company | record-reference | True | False | False | False | True |
| created_by | Created by | actor-reference | True | False | False | False | True |
| created_at | Created at | timestamp | True | False | False | False | True |
| description | Description | text | True | False | False | False | True |
| email_addresses | Email addresses | email-address | True | False | True | True | True |
| facebook | Facebook | text | True | False | False | False | True |
| first_calendar_interaction | First calendar interaction | interaction | True | False | False | False | True |
| first_email_interaction | First email interaction | interaction | True | False | False | False | True |
| github | GitHub | text | True | False | False | False | True |
| instagram | Instagram | text | True | False | False | False | True |
| job_title | Job title | text | True | False | False | False | True |
| last_calendar_interaction | Last calendar interaction | interaction | True | False | False | False | True |
| last_email_interaction | Last email interaction | interaction | True | False | False | False | True |
| linkedin | LinkedIn | text | True | False | False | False | True |
| locale | Locale | select | True | False | False | False | True |
| name | Name | personal-name | True | False | False | False | True |
| phone_numbers | Phone numbers | phone-number | True | False | False | True | True |
| primary_location | Primary location | location | True | False | False | False | True |
| record_id | Record ID | text | False | False | True | False | True |
| twitter | Twitter | text | True | False | False | False | True |
| updated_by | Updated by | actor-reference | False | False | False | False | True |
| updated_at | Updated at | timestamp | False | False | False | False | True |
| website | Website | text | True | False | False | False | True |
| whatsapp | WhatsApp | text | True | False | False | False | True |
| your_custom_field_1 | … | … | … | … | … | … | … |

> Примечание: таблица выше — снимок. При изменениях схемы Attio её нужно перегенерировать через `ATTIO_LIST_ATTRIBUTES`.
