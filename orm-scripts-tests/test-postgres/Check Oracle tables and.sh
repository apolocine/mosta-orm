 
 #   Check Oracle tables and data
 npx tsx -e "                                                               
   const oracledb = require('oracledb');
   oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
   oracledb.autoCommit = true;
   oracledb.fetchAsString = [oracledb.DB_TYPE_CLOB];
   (async () => {
     const conn = await oracledb.getConnection({ user: 'devuser', password:
   'devpass26', connectString: 'localhost:1521/XEPDB1' });
     const r = await conn.execute('SELECT table_name FROM user_tables ORDER
   BY table_name');
     const tables = r.rows.map(r => r.TABLE_NAME);
     console.log('Tables (' + tables.length + '):', tables.join(', '));
     for (const t of tables) {
       try {
         const c = await conn.execute('SELECT COUNT(*) as CNT FROM \"' + t +
   '\"');
         console.log('  ' + t + ': ' + c.rows[0].CNT + ' rows');
       } catch(e) { console.log('  ' + t + ': ERROR ' +
   e.message.split('\n')[0]); }
     }
     await conn.close();
   })();
   " 2>&1
 
&& 
#    Check Oracle tables from SecuAccessPro dir
cd /home/hmd/dev/MostaGare-Install/SecuAccessPro && npx tsx -e "           
   const oracledb = require('oracledb');
   oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
   oracledb.autoCommit = true;
   oracledb.fetchAsString = [oracledb.DB_TYPE_CLOB];
   (async () => {
     const conn = await oracledb.getConnection({ user: 'devuser', password:
   'devpass26', connectString: 'localhost:1521/XEPDB1' });
     const r = await conn.execute('SELECT table_name FROM user_tables ORDER
   BY table_name');
     const tables = r.rows.map(r => r.TABLE_NAME);
     console.log('Tables (' + tables.length + '):', tables.join(', '));
     for (const t of tables) {
       try {
         const c = await conn.execute('SELECT COUNT(*) as CNT FROM \"' + t +
   '\"');
         console.log('  ' + t + ': ' + c.rows[0].CNT + ' rows');
       } catch(e) { console.log('  ' + t + ': ERROR'); }
     }
     await conn.close();
   })();
   " 2>&1


&&

#   Check clients table column types
   npx tsx -e "                                                               
   const oracledb = require('oracledb');
   oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
   oracledb.autoCommit = true;
   oracledb.fetchAsString = [oracledb.DB_TYPE_CLOB];
   (async () => {
     const conn = await oracledb.getConnection({ user: 'devuser', password:
   'devpass26', connectString: 'localhost:1521/XEPDB1' });
     // Check column types for clients table
     const r = await conn.execute(\"SELECT column_name, data_type,
   data_length FROM user_tab_columns WHERE table_name = 'clients' ORDER BY
   column_id\");
     console.log('=== clients columns ===');
     for (const row of r.rows) {
       console.log('  ' + row.COLUMN_NAME + ': ' + row.DATA_TYPE + '(' +
   row.DATA_LENGTH + ')');
     }
     await conn.close();
   })();
   " 2>&1
&&
#    Drop clients table for recreation with CLOB photo
  cd /home/hmd/dev/MostaGare-Install/SecuAccessPro && npx tsx -e "           
   const oracledb = require('oracledb');
   oracledb.autoCommit = true;
   (async () => {
     const conn = await oracledb.getConnection({ user: 'devuser', password:
   'devpass26', connectString: 'localhost:1521/XEPDB1' });
     // Drop clients table (will be recreated with photo as CLOB)
     try {
       await conn.execute('DROP TABLE \"clients\" CASCADE CONSTRAINTS');
       console.log('Dropped clients table');
     } catch(e) { console.log('clients:', e.message.split('\n')[0]); }
     await conn.close();
   })();
   " 2>&1



