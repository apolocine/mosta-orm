# Drop tables in HSQLDB to start fresh, then the install will recreate
   them with the fixed DDL                        
   for tbl in ticket_counters locker_events rfid_tags lockers scan_logs
   tickets client_accesses subscription_plans activities role_permissions
   user_roles clients auditlogs settings permission_categories permissions
    roles users; do
     curl -s -X POST http://localhost:8765/query \
       -H 'Content-Type: application/json' \
       -d "{\"sql\":\"DROP TABLE IF EXISTS \\\"$tbl\\\"\",\"params\":[]}"
   2>&1
   done                 
##  Drop all HSQLDB tables for fresh install
