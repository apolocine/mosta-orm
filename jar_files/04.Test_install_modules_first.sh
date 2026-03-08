# Test install-modules first
   curl -s -X POST http://localhost:4567/api/setup/install-modules \
     -H 'Content-Type: application/json' \                              
     -d '{"modules":["ticketing","access-control"]}' 2>&1
# Test install-modules API

