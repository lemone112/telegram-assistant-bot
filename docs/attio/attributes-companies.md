| api_slug | title | type | is_writable | is_required | is_unique | is_multiselect | is_system |
| --- | --- | --- | --- | --- | --- | --- | --- |
| name | Name | text | True | False | False | False | True |
| domains | Domains | domain | True | False | True | True | True |
| description | Description | text | True | False | False | False | True |
| primary_location | Primary location | location | True | False | False | False | True |
| team | Team | record-reference | True | False | False | True | True |
| created_at | Created at | timestamp | True | False | False | False | True |
| created_by | Created by | actor-reference | True | False | False | False | True |
| updated_at | Updated at | timestamp | False | False | False | False | True |
| updated_by | Updated by | actor-reference | False | False | False | False | True |
| record_id | Record ID | text | False | False | True | False | True |

> Полная таблица полей зафиксирована в workspace, но из-за объёма её лучше хранить как автоматически генерируемый артефакт (см. `ATTIO_LIST_ATTRIBUTES`).
