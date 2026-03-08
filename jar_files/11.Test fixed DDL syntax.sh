 ## Test fixed DDL syntax on HSQLDB
 curl -s -X POST http://localhost:8765/query \                             
     -H 'Content-Type: application/json' \                                   
     -d '{"sql":"CREATE TABLE IF NOT EXISTS \"test_ddl\" (\n  \"id\"         
   VARCHAR(36) PRIMARY KEY,\n  \"name\" VARCHAR(4000) NOT NULL,\n            
   \"price\" DOUBLE DEFAULT 0 NOT NULL,\n  \"status\" VARCHAR(4000)          
   DEFAULT '\''active'\'' NOT NULL,\n  \"count\" DOUBLE DEFAULT              
   0\n)","params":[]}' 2>&1


