java -cp hsqldb-2.7.2.jar org.hsqldb.util.SqlTool --inlineRc=   
   "url=jdbc:hsqldb:hsql://localhost:9001/secuaccessdb,user=SA,password="    
   --sql="SELECT 1 FROM INFORMATION_SCHEMA.SYSTEM_USERS;" 2>&1
