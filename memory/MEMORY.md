# Mini-Core Project Memory

## Environment

### PostgreSQL access
`psql` is NOT installed on the host macOS. Always use Docker:
```bash
docker exec global_banking_db psql -U admin -d banking_system -c "..."
```
The running PostgreSQL container is named `global_banking_db`.

### Liquibase
Run via Docker Compose. Without `seed` context, all changesets still run (including `context="seed"` ones — Liquibase runs everything when no context is specified). To reset to reference-data-only state, run Liquibase then TRUNCATE accounts CASCADE + sync_cursors CASCADE.
