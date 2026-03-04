 # Test apartments list
   echo "=== APPARTEMENTS ==="
   curl -s http://localhost:3002/api/apartments | python3 -c "import sys,json; data=json.load(sys.stdin); [print(f'{a[\"reference\"]} |
   {a[\"title\"]} | {a[\"city\"]} | {a[\"monthlyRent\"]} DA | {a[\"status\"]}') for a in data]"

   echo ""
   echo "=== LOCATAIRES ==="
   curl -s http://localhost:3002/api/tenants | python3 -c "import sys,json; data=json.load(sys.stdin); [print(f'{t[\"lastName\"]} {t[\"firstName\"]}
    | {t[\"phone\"]} | {t[\"profession\"]} | {t[\"status\"]}') for t in data]"

   echo ""
   echo "=== BAUX (avec relations) ==="
   curl -s http://localhost:3002/api/leases | python3 -c "
   import sys,json; data=json.load(sys.stdin)
   for l in data:
     apt = l.get('apartment',{})
     ten = l.get('tenant',{})
     apt_name = apt.get('title','?') if isinstance(apt,dict) else str(apt)[:8]
     ten_name = f'{ten.get(\"lastName\",\"?\")} {ten.get(\"firstName\",\"?\")}' if isinstance(ten,dict) else str(ten)[:8]
     print(f'{l[\"leaseNumber\"]} | {apt_name} | {ten_name} | {l[\"monthlyRent\"]} DA | {l[\"status\"]}')
   "

   echo ""
   echo "=== PAIEMENTS ==="
   curl -s http://localhost:3002/api/payments | python3 -c "import sys,json; data=json.load(sys.stdin); [print(f'{p[\"period\"]} |
   {p[\"amountDue\"]} DA | {p[\"amountPaid\"]} DA | {p[\"status\"]}') for p in data]"
   #Test all CRUD endpoints

