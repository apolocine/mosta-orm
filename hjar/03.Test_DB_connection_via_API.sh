##  Test DB connection via API
 curl -s -X POST http://localhost:4567/api/setup/test-db \
     -H 'Content-Type: application/json' \
     -d '{"dialect":"hsqldb","host":"localhost","port":9001,"name":"secuac
   cessdb","createIfNotExists":true}' 2>&1
  

