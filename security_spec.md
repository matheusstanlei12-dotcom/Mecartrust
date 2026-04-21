# Security Specification - Lar360

## Data Invariants
1. A user can only access their own user profile.
2. A user can only access residence data if they are in the `members` array of that residence.
3. Only the `ownerId` of a residence can rename or delete the residence.
4. Only the `ownerId` of a residence can approve or reject access requests.
5. All sensitive actions (login, join, delete) must be logged in the `/logs` collection.
6. Feedback and Logs are write-only for users (only admins can read).
7. `createdAt` and `ownerId` fields are immutable after creation.
8. `inviteCode` is automatically generated and should not be modified by members.

## The "Dirty Dozen" Payloads (Rejected)
1. `{ "isAdmin": true }` to `/users/my_id` by a non-admin.
2. `{ "residenceId": "res_A", "status": "approved" }` to `/residences/res_A/accessRequests/req_B` by a non-owner.
3. `{ "members": ["attacker_id"] }` update to `/residences/res_A` by a non-owner.
4. `{ "id": "res_A", "ownerId": "attacker_id" }` create residence where ownerId != auth.uid.
5. `{ "rating": 11 }` to `/feedback`.
6. `{ "userId": "victim_id", "action": "login" }` to `/logs` where userId != auth.uid.
7. Read request to `/logs/any` by a non-admin.
8. Read request to `/feedback/any` by a non-admin.
9. `{ "prices": { "store": -50 } }` to any list item (negative prices).
10. `{ "items": [ { "name": "bad item", "quantity": 1000000 } ] }` to a shopping list (excessive quantities).
11. `{ "id": "res_X", "inviteCode": "HACKED" }` create/update residence with custom code.
12. `{ "current": -1 }` to inventory (negative stock).

## The Test Runner
(Tests would go here in a full environment).
