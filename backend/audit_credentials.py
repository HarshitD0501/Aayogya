import asyncio
import os
from dotenv import load_dotenv
import httpx
from livekit import api

load_dotenv()

async def verify_all():
    print("=" * 60)
    print("PRINCIPAL AI ENGINEER TELEPHONY & CLOUD AUDIT")
    print("=" * 60)
    
    # 1. Twilio REST API Audit
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    phone = os.getenv("TWILIO_PHONE_NUMBER")
    
    print("\n[1] AUDITING TWILIO CORE CREDENTIALS...")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                f"https://api.twilio.com/2010-04-01/Accounts/{sid}.json",
                auth=(sid, token),
            )
            if res.status_code == 200:
                data = res.json()
                print(f"  [PASS] Twilio Account: Active ({data.get('type', 'Unknown')} Account)")
                print(f"  [PASS] Friendly Name: {data.get('friendly_name')}")
            else:
                print(f"  [FAIL] Twilio Auth Error: {res.status_code} - {res.text}")
                
            # Check phone number ownership
            res_phone = await client.get(
                f"https://api.twilio.com/2010-04-01/Accounts/{sid}/IncomingPhoneNumbers.json",
                auth=(sid, token),
            )
            if res_phone.status_code == 200:
                numbers = res_phone.json().get("incoming_phone_numbers", [])
                match = any(n.get("phone_number") == phone for n in numbers)
                if match:
                    print(f"  [PASS] Phone Number: {phone} is verified and active on this account")
                else:
                    found = [n.get("phone_number") for n in numbers]
                    print(f"  [WARN] Phone {phone} not found in account numbers: {found}")
            else:
                print(f"  [FAIL] Could not fetch phone numbers: {res_phone.status_code}")
                
            # Check SIP Domains
            res_sip = await client.get(
                f"https://api.twilio.com/2010-04-01/Accounts/{sid}/SIP/Domains.json",
                auth=(sid, token),
            )
            if res_sip.status_code == 200:
                domains = res_sip.json().get("domains", [])
                domain_names = [d.get("domain_name") for d in domains]
                print(f"  [INFO] Found {len(domains)} Twilio SIP Domain(s): {domain_names}")
                domain_cfg = os.getenv("TWILIO_SIP_DOMAIN")
                if any(d.get("domain_name") == domain_cfg for d in domains):
                    print(f"  [PASS] Configured SIP Domain '{domain_cfg}' exists in Twilio")
                else:
                    print(f"  [WARN] SIP Domain '{domain_cfg}' not found in Twilio SIP domains: {domain_names}")
    except Exception as e:
        print(f"  [ERROR] Twilio audit exception: {e}")

    # 2. LiveKit Cloud & SIP Trunk Audit
    lk_url = os.getenv("LIVEKIT_URL")
    lk_key = os.getenv("LIVEKIT_API_KEY")
    lk_sec = os.getenv("LIVEKIT_API_SECRET")
    trunk_id = os.getenv("LIVEKIT_SIP_TRUNK_ID")
    
    print("\n[2] AUDITING LIVEKIT CLOUD & SIP TRUNKING...")
    try:
        lk = api.LiveKitAPI(lk_url, lk_key, lk_sec)
        rooms = await lk.room.list_rooms(api.ListRoomsRequest())
        print(f"  [PASS] LiveKit Cloud Connected: {lk_url}")
        print(f"  [PASS] API Key/Secret Valid. Active rooms: {len(rooms.rooms)}")
        
        try:
            trunks = await lk.sip.list_sip_outbound_trunk(api.ListSIPOutboundTrunkRequest())
            trunk_list = trunks.items
            print(f"  [INFO] Found {len(trunk_list)} LiveKit Outbound SIP Trunk(s)")
            for t in trunk_list:
                print(f"    - Outbound Trunk: sip_trunk_id='{t.sip_trunk_id}', name='{t.name}', address='{t.address}'")
            matched = any(t.sip_trunk_id == trunk_id for t in trunk_list)
            if matched:
                print(f"  [PASS] Configured Outbound Trunk '{trunk_id}' matches LiveKit Cloud!")
            else:
                inbound_trunks = await lk.sip.list_sip_inbound_trunk(api.ListSIPInboundTrunkRequest())
                in_list = inbound_trunks.items
                print(f"  [INFO] Found {len(in_list)} LiveKit Inbound SIP Trunk(s)")
                for it in in_list:
                    print(f"    - Inbound Trunk: sip_trunk_id='{it.sip_trunk_id}', name='{it.name}'")
                in_matched = any(t.sip_trunk_id == trunk_id for t in in_list)
                if in_matched:
                    print(f"  [INFO] Trunk '{trunk_id}' is configured as an Inbound Trunk in LiveKit")
                else:
                    print(f"  [WARN] Trunk ID '{trunk_id}' not found in LiveKit Cloud Outbound or Inbound Trunks")
        except Exception as se:
            print(f"  [WARN] SIP Trunk list call: {se}")
        finally:
            await lk.aclose()
    except Exception as e:
        print(f"  [FAIL] LiveKit API Error: {e}")

    print("\n" + "=" * 60)

if __name__ == "__main__":
    asyncio.run(verify_all())
