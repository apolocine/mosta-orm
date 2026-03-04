 mkdir -p data && npx tsx src/index.ts &                                                                                                             
   sleep 4 && echo "=== REGISTER ===" && curl -s -X POST http://localhost:3003/api/auth/login -H "Content-Type: application/json" -d                   
   '{"login":"admin","password":"Admin123!"}' | python3 -m json.tool
##  Start auth-manager server and test login

