# Test installation again with fixed DDL
curl -s -X POST http://localhost:4567/api/setup/install \
     -H 'Content-Type: application/json' \
     -d '{
       "dialect": "hsqldb",
       "db": {"host":"localhost","port":9001,"name":"secuaccessdb","user":"SA","password":""},
       "admin": {"email":"admin@secuaccess.dz","password":"Admin@123456","firstName":"Admin","lastName":"System"},
       "seed": {"activities":true,"demoUsers":false,"demoData":false},
       "modules": ["ticketing"]
     }' 2>&1
   

