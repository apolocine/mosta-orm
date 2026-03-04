
───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 Bash command

   npx tsx src/index.ts &
   sleep 3

   echo "=== EXPERIENCES (seed) ==="
   curl -s http://localhost:3001/api/experiences | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f'  {e[\"name\"]} ({e[\"category\"]})
    — {e[\"pricePerPerson\"]} DA') for e in d['data']]" 2>/dev/null || curl -s http://localhost:3001/api/experiences | head -c 300

   echo -e "\n=== CREATE PASSENGER ==="
   PAS_ID=$(curl -s -X POST http://localhost:3001/api/passengers \
     -H "Content-Type: application/json" \
     -d '{"firstName":"Karim","lastName":"Boudiaf","email":"karim@test.com","phone":"0555111222"}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"'
   -f4)
   echo "Passenger ID: $PAS_ID"

   echo -e "\n=== GET EXPERIENCES IDs ==="
   EXP_ID=$(curl -s http://localhost:3001/api/experiences | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
   echo "Experience ID: $EXP_ID"

   echo -e "\n=== CREATE RESERVATION ==="
   RES=$(curl -s -X POST http://localhost:3001/api/reservations \
     -H "Content-Type: application/json" \
     -d "{\"passengerId\":\"$PAS_ID\",\"experienceId\":\"$EXP_ID\",\"flightDate\":\"2026-03-15\",\"timeSlot\":\"06:00\",\"seats\":3,\"paymentMethod\
   ":\"online\"}")
   echo "$RES" | head -c 400
   RES_ID=$(echo "$RES" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

   echo -e "\n\n=== CONFIRM RESERVATION ==="
   curl -s -X PATCH "http://localhost:3001/api/reservations/$RES_ID/confirm" | head -c 200

   echo -e "\n\n=== COMPLETE RESERVATION ==="
   curl -s -X PATCH "http://localhost:3001/api/reservations/$RES_ID/complete" | head -c 200

   echo -e "\n\n=== PASSENGER POINTS ==="
   curl -s "http://localhost:3001/api/passengers/$PAS_ID" | grep -o '"loyaltyPoints":[0-9]*\|"totalFlights":[0-9]*'

   echo -e "\n\n=== LIST RESERVATIONS WITH RELATIONS ==="
   curl -s http://localhost:3001/api/reservations | python3 -c "
   import sys,json
   d=json.load(sys.stdin)
   for r in d['data']:
     p = r.get('passenger',{}) or {}
     e = r.get('experience',{}) or {}
     print(f'  {r[\"reservationNumber\"]} | {p.get(\"firstName\",\"?\")} {p.get(\"lastName\",\"?\")} | {e.get(\"name\",\"?\")} | {r[\"status\"]}')
   " 2>/dev/null || curl -s http://localhost:3001/api/reservations | head -c 300

   kill %1 2>/dev/null
   rm -f ./balloon.db
   Full CRUD test with relations

 Command contains quoted characters in flag names

