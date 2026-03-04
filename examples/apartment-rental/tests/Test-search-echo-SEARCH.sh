 # Test search
   echo "=== SEARCH Alger ==="
   curl -s "http://localhost:3002/api/apartments?city=Alger" | python3 -c "import sys,json; data=json.load(sys.stdin); print(f'{len(data)}
   resultats'); [print(f'  {a[\"reference\"]} {a[\"title\"]}') for a in data]"

   echo ""
   echo "=== SEARCH locataire 'karim' ==="
   curl -s "http://localhost:3002/api/tenants?search=karim" | python3 -c "import sys,json; data=json.load(sys.stdin); print(f'{len(data)}
   resultat(s)'); [print(f'  {t[\"lastName\"]} {t[\"firstName\"]}') for t in data]"

   echo ""
   echo "=== Mark paid (encaisser un loyer en retard) ==="
   LATE_ID=$(curl -s "http://localhost:3002/api/payments?status=late" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
   curl -s -X PATCH "http://localhost:3002/api/payments/$LATE_ID/mark-paid" \
     -H "Content-Type: application/json" \
     -d '{"amountPaid": 50000, "method": "cash"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Statut: {d[\"status\"]}, Paye:
   {d[\"amountPaid\"]} DA')"

   echo ""
   echo "=== Totaux bail 1 ==="
   LEASE_ID=$(curl -s http://localhost:3002/api/leases | python3 -c "import sys,json; print(json.load(sys.stdin)[1]['id'])")
   curl -s "http://localhost:3002/api/payments/totals/$LEASE_ID" | python3 -m json.tool
  # Test search, mark-paid, and totals

