| api_slug | title | type | is_writable | is_required | is_unique | is_multiselect | is_system |
| --- | --- | --- | --- | --- | --- | --- | --- |
| name | Deal name | text | True | True | False | False | True |
| stage | Stage | status | True | True | False | False | True |
| owner | Owner | actor-reference | True | True | False | False | True |
| associated_company | Associated company | record-reference | True | False | False | False | True |
| associated_people | Associated people | record-reference | True | False | False | True | True |
| value | Value | currency | True | False | False | False | True |
| created_at | Created at | timestamp | True | False | False | False | True |
| created_by | Created by | actor-reference | True | False | False | False | True |
| updated_at | Updated at | timestamp | False | False | False | False | True |
| updated_by | Updated by | actor-reference | False | False | False | False | True |
| record_id | Record ID | text | False | False | True | False | True |

> Требуемые поля для создания сделки: **name**, **stage**, **owner**.
