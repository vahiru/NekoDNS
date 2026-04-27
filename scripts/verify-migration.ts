import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const oldDbPath = resolve(process.env.OLD_DB_PATH || "OLD/database.db");
const migratedDbPath = resolve(process.env.MIGRATED_DB_PATH || "/tmp/nekodns-migration-verify2.db");

if (!existsSync(oldDbPath)) {
  console.error(`Old database not found: ${oldDbPath}`);
  process.exit(1);
}
if (!existsSync(migratedDbPath)) {
  console.error(`Migrated database not found: ${migratedDbPath}`);
  process.exit(1);
}

const oldDb = new Database(oldDbPath, { readonly: true });
const newDb = new Database(migratedDbPath, { readonly: true });

const checks = [
  ["old.users", scalar(oldDb, "SELECT COUNT(*) FROM users")],
  ["new.users", scalar(newDb, "SELECT COUNT(*) FROM users")],
  ["old.dns_records", scalar(oldDb, "SELECT COUNT(*) FROM dns_records")],
  ["new.dns_records", scalar(newDb, "SELECT COUNT(*) FROM dns_records")],
  ["old.subdomain_applications", scalar(oldDb, "SELECT COUNT(*) FROM subdomain_applications")],
  ["new.applications", scalar(newDb, "SELECT COUNT(*) FROM applications")],
  ["old.application_votes", scalar(oldDb, "SELECT COUNT(*) FROM application_votes")],
  ["new.application_votes", scalar(newDb, "SELECT COUNT(*) FROM application_votes")],
  ["old.abuse_reports", scalar(oldDb, "SELECT COUNT(*) FROM abuse_reports")],
  ["new.abuse_reports", scalar(newDb, "SELECT COUNT(*) FROM abuse_reports")],
  ["new.legacy_bcrypt_users", scalar(newDb, "SELECT COUNT(*) FROM users WHERE password_salt = 'legacy-bcrypt'")],
  ["new.orphan_app_users", scalar(newDb, "SELECT COUNT(*) FROM applications a LEFT JOIN users u ON u.id = a.user_id WHERE u.id IS NULL")],
  ["new.orphan_vote_apps", scalar(newDb, "SELECT COUNT(*) FROM application_votes v LEFT JOIN applications a ON a.id = v.application_id WHERE a.id IS NULL")],
  ["new.orphan_vote_admins", scalar(newDb, "SELECT COUNT(*) FROM application_votes v LEFT JOIN users u ON u.id = v.admin_user_id WHERE u.id IS NULL")],
  [
    "new.update_apps_missing_target",
    scalar(
      newDb,
      "SELECT COUNT(*) FROM applications a LEFT JOIN dns_records r ON r.id = a.target_dns_record_id WHERE a.request_type = 'update' AND a.target_dns_record_id IS NOT NULL AND r.id IS NULL",
    ),
  ],
];

for (const [label, value] of checks) {
  console.log(`${label}=${value}`);
}

function scalar(db: Database.Database, sql: string) {
  const row = db.prepare(sql).get() as Record<string, number | string> | undefined;
  if (!row) return 0;
  const first = Object.values(row)[0];
  return typeof first === "number" ? first : Number(first ?? 0);
}
