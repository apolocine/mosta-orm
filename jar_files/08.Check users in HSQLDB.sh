## Check users in HSQLDB
curl -s -X POST http://localhost:8765/query \                             
     -H 'Content-Type: application/json' \                                   
     -d '{"sql":"SELECT \"id\", \"email\", \"firstName\", \"lastName\",      
   \"status\" FROM \"users\"","params":[]}' 2>&1
   

