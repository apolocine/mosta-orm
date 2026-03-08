java --source 11 -cp /home/hmd/dev/MostaGare-Install/SecuAccessPro/jar_   
   files/hsqldb-2.7.2.jar /home/hmd/dev/MostaGare-Install/SecuAccessPro/no   
   de_modules/@mostajs/orm/bridge/MostaJdbcBridge.java --jdbc-url            
   "jdbc:hsqldb:hsql://localhost:9001/secuaccessdb" --user SA --password     
   "" --port 8765 2>&1 &                                                     
   sleep 3 && curl -s http://localhost:8765/health 2>&1                      
## Test bridge manually
