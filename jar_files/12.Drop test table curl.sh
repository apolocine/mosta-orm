##   Drop test table 
curl -s -X POST http://localhost:8765/query \                             
     -H 'Content-Type: application/json' \                                   
     -d '{"sql":"DROP TABLE IF EXISTS \"test_ddl\"","params":[]}' 2>&1       
 
