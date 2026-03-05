# FarmWallet USSD Flow

## Main Menu (*920*72#)

```
FarmWallet Rice Shops

1. Register as Shop (Ghana Card)
2. Browse Shops & Buy Rice
3. Shop Owner - Manage My Shop
4. Mechanization Services
5. Share your info
6. VSLA - My Profile         ← Only when VSL DB configured
0. Exit
```

---

## Option 1: Register as Shop

```
Enter Ghana Card number
  → Enter business/shop name
    → Enter MoMo number
      → Select MoMo provider (MTN/Vodafone/AirtelTigo)
        → Create 4-digit PIN
          → Confirm PIN
            → Add rice (type → bag size → qty → price)
              → Add more? Yes/No
                → END: Shop ready! Shop ID: XX
```

---

## Option 2: Browse Shops & Buy Rice

```
Select Shop (list of 10)
  → Select rice type
    → Enter quantity
      → Select MoMo provider (MTN/Vodafone/AirtelTigo)
        → END: Order confirmed, MoMo prompt sent
```

---

## Option 3: Shop Owner - Manage My Shop

```
Enter 4-digit PIN (or Set PIN if first time)
  → Manage menu:
    1. Add rice to inventory
    2. Back
```

---

## Option 4: Mechanization Services

```
Select service (Tractor, Plowing, Threshing, etc.)
  → Select provider
    → Enter acres (for per-acre services)
      → END: Total cost + provider contact
```

---

## Option 5: Share your info

```
Enter name
  → Select region
    → Select interest (Farmer/Buyer/Both/Browsing)
      → Enter farm size (acres)
        → END: Thank you, info saved
```

---

## Option 6: VSLA - My Profile (when VSL DB configured)

### Flow
```
Look up user by phone
  → If not found: END "Phone not found in VSLA system"
  → If found: VSLA submenu
```

### VSLA Submenu

**Farmer / VSLA Leader / Input Dealer:**
```
VSLA - My Profile

1. My Profile
2. My Groups
3. My Savings
4. Make Contribution
0. Back
```

- **My Profile** → END with Name, Type, Status
- **My Groups** → List of groups (from GroupMembers)
- **My Savings** → Total confirmed contributions per group
- **Make Contribution** → Select group → Enter amount (GHS) → Select MoMo provider → Paystack charge; webhook confirms and updates GroupWallet
- **Direct shortcode** → Dial *920*72*{extension}# (e.g. 100 for first group) to skip group selection and contribute directly
- **Back** → Main menu

**VBA:**
```
VSLA - My Profile

1. My Profile
2. Assigned Groups
3. Upcoming Visits
0. Back
```

- **My Profile** → END with Name, Type, Status
- **Assigned Groups** → Groups from VbaGroupAssignment
- **Upcoming Visits** → Scheduled visits from VbaVisit
- **Back** → Main menu

---

## Shortcodes

**All extensions use *920*72#** — one shortcode, unique extension per entity.

| Code | Purpose |
|------|---------|
| *920*72# | Main menu |
| *920*72*01# | Direct to Shop 01 (rice) |
| *920*72*50# | Direct to Mechanization Provider (extensions 50-99) |
| *920*72*100# | Direct to VSLA Group (extensions 100+; contribute to group wallet) |

**Extension ranges:** Shops 01-49, Providers 50-99, VSLA Groups 100+. Run `npm run add-ussd-extensions` to create the registry and populate from existing data.
