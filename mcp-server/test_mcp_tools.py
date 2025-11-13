"""
Test script for MCP server tools
Run with: python test_mcp_tools.py
"""

import json
import asyncio
import os
from server_python import (
    onboard_user,
    add_regulatory_source,
    basic_compliance_check,
    scrape_state_regulation,
    full_ai_compliance_check,
    upgrade_to_full_ai,
    get_compliance_summary
)


async def test_onboarding():
    """Test user onboarding"""
    print("\n=== Test 1: Onboard User ===")
    
    result = await onboard_user(
        user_id="test_user_123",
        email="test@buildasoil.com",
        industry="organic_agriculture",
        target_states=["CO", "CA", "WA"],
        compliance_tier="basic",
        certifications=["OMRI", "USDA_Organic"]
    )
    
    print(result[0].text)
    return json.loads(result[0].text)


async def test_add_source():
    """Test adding regulatory source"""
    print("\n=== Test 2: Add Regulatory Source ===")
    
    result = await add_regulatory_source(
        user_id="test_user_123",
        state_code="CO",
        regulation_type="organic",
        source_url="https://ag.colorado.gov/plants/organic",
        source_title="Colorado Organic Certification Requirements",
        source_description="Official CO organic certification requirements",
        key_requirements="Must display OMRI certification number on label"
    )
    
    print(result[0].text)
    return json.loads(result[0].text)


async def test_basic_check():
    """Test basic compliance check (no AI)"""
    print("\n=== Test 3: Basic Compliance Check ===")
    
    result = await basic_compliance_check(
        user_id="test_user_123",
        product_name="Craft Blend Organic Soil",
        product_type="soil_amendment",
        target_states=["CO", "CA"]
    )
    
    print(result[0].text)
    return json.loads(result[0].text)


async def test_scraping():
    """Test regulation scraping"""
    print("\n=== Test 4: Scrape State Regulation ===")
    
    result = await scrape_state_regulation(
        state_code="CO",
        regulation_type="organic",
        source_url="https://ag.colorado.gov/plants/organic"
    )
    
    data = json.loads(result[0].text)
    print(f"Scraped {len(data.get('full_text', ''))} characters")
    print(f"Found {len(data.get('key_sections', []))} key sections")
    return data


async def test_full_ai_check():
    """Test full AI compliance check"""
    print("\n=== Test 5: Full AI Compliance Check ===")
    
    # Note: This requires ANTHROPIC_API_KEY to be set
    result = await full_ai_compliance_check(
        user_id="test_user_123",
        product_name="Craft Blend Organic Soil",
        product_type="soil_amendment",
        target_states=["CO", "CA"],
        ingredients=["Peat Moss 40%", "Compost 30%", "Perlite 20%", "Mycorrhizae 10%"],
        claims=["OMRI Listed", "100% Organic"],
        certifications=["OMRI"],
        bom_info="Premium organic soil blend with added mycorrhizae"
    )
    
    print(result[0].text)
    return json.loads(result[0].text)


async def test_upgrade():
    """Test upgrade to Full AI"""
    print("\n=== Test 6: Upgrade to Full AI ===")
    
    result = await upgrade_to_full_ai(
        user_id="test_user_123",
        stripe_customer_id="cus_test123"
    )
    
    print(result[0].text)
    return json.loads(result[0].text)


async def test_summary():
    """Test compliance summary"""
    print("\n=== Test 7: Get Compliance Summary ===")
    
    result = await get_compliance_summary(
        user_id="test_user_123",
        days=30
    )
    
    print(result[0].text)
    return json.loads(result[0].text)


async def run_all_tests():
    """Run all tests in sequence"""
    print("Starting MCP Server Tests...")
    print("=" * 60)
    
    try:
        # Test 1: Onboarding
        await test_onboarding()
        
        # Test 2: Add Source
        await test_add_source()
        
        # Test 3: Basic Check
        await test_basic_check()
        
        # Test 4: Scraping
        await test_scraping()
        
        # Test 5: Full AI Check (skip if no API key)
        if os.getenv("ANTHROPIC_API_KEY"):
            await test_full_ai_check()
        else:
            print("\n=== Test 5: Full AI Check SKIPPED (no API key) ===")
        
        # Test 6: Upgrade
        await test_upgrade()
        
        # Test 7: Summary
        await test_summary()
        
        print("\n" + "=" * 60)
        print("All tests completed!")
        
    except Exception as e:
        print(f"\nTest failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()
    
    # Run tests
    asyncio.run(run_all_tests())
