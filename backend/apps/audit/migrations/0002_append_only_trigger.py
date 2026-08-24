"""
Make the audit log append-only in the database.

Application-level discipline is not enough here. The actions worth recording -
a role grant, a payment approval, a mark changed after a course ended - are
exactly the ones someone with database access would want to edit away. A
trigger refuses UPDATE and DELETE regardless of which code, ORM or psql
session issues them.

TRUNCATE is deliberately not covered: row-level triggers do not fire on it,
and Django's test teardown needs it. A TRUNCATE requires table ownership,
which the application role should not have in production - that is a
deployment concern, documented in the runbook rather than enforced here.
"""

from django.db import migrations

APPEND_ONLY = """
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        'audit_log is append-only: % is not permitted on this table', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
"""

DROP = """
DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
DROP FUNCTION IF EXISTS audit_log_append_only();
"""


class Migration(migrations.Migration):
    dependencies = [("audit", "0001_initial")]

    operations = [migrations.RunSQL(APPEND_ONLY, reverse_sql=DROP)]
