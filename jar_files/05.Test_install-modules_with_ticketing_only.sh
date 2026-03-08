## Test install-modules with ticketing only
curl -s -X POST http://localhost:4567/api/setup/install-modules \         
     -H 'Content-Type: application/json' \                                   
     -d '{"modules":["ticketing"]}' 2>&1                                     
   
