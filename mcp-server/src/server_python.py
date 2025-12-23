"""
MuRP Compliance MCP Server (Python)
Provides tools for state regulation management and compliance checking
"""

import os
import json
import asyncio
from typing import Any, Dict, List, Optional
from datetime import datetime

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
from supabase import create_client, Client
from anthropic import Anthropic
import pytesseract
from PIL import Image
import requests
from bs4 import BeautifulSoup

# Initialize clients
supabase: Client = create_client(
    os.getenv("SUPABASE_URL", ""),
    os.getenv("SUPABASE_SERVICE_KEY", "")
)

anthropic = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY", ""))

# Initialize MCP server
app = Server("tgf-compliance-server")


# ============================================================================
# Tool 1: Onboard User
# ============================================================================
@app.call_tool()
async def onboard_user(
    user_id: str,
    email: str,
    industry: str,
    target_states: List[str],
    compliance_tier: str = "basic",
    certifications: Optional[List[str]] = None
) -> List[TextContent]:
    """
    Onboard a new user with industry settings
    
    Args:
        user_id: Unique user identifier
        email: User email
        industry: organic_agriculture | fertilizer_manufacturing | soil_amendments
        target_states: List of state codes ['CO', 'CA', 'WA']
        compliance_tier: basic | full_ai
        certifications: Optional list of certifications held
    """
    try:
        # Get industry settings
        industry_result = supabase.table("industry_settings") \
            .select("*") \
            .eq("industry", industry) \
            .execute()
        
        if not industry_result.data:
            return [TextContent(
                type="text",
                text=json.dumps({"error": f"Industry '{industry}' not found"})
            )]
        
        industry_data = industry_result.data[0]
        
        # Create user profile
        profile_data = {
            "user_id": user_id,
            "email": email,
            "industry": industry,
            "target_states": target_states,
            "compliance_tier": compliance_tier,
            "certifications_held": certifications or [],
            "product_types": industry_data.get("default_product_types", []),
            "onboarding_completed": True,
            "subscription_status": "active",
            "trial_checks_remaining": 5,
            "checks_this_month": 0,
            "monthly_check_limit": 50 if compliance_tier == "full_ai" else 0,
        }
        
        result = supabase.table("user_compliance_profiles") \
            .upsert(profile_data, on_conflict="user_id") \
            .execute()
        
        return [TextContent(
            type="text",
            text=json.dumps({
                "success": True,
                "user_id": user_id,
                "industry": industry,
                "tier": compliance_tier,
                "trial_checks_remaining": 5,
                "industry_focus_areas": industry_data.get("focus_areas", []),
            }, indent=2)
        )]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 2: Add Regulatory Source (Basic Mode)
# ============================================================================
@app.call_tool()
async def add_regulatory_source(
    user_id: str,
    state_code: str,
    regulation_type: str,
    source_url: str,
    source_title: str,
    source_description: Optional[str] = None,
    key_requirements: Optional[str] = None
) -> List[TextContent]:
    """
    Add a regulatory source for Basic Mode users
    
    Args:
        user_id: User ID
        state_code: Two-letter state code (e.g., 'CO')
        regulation_type: organic | fertilizer | labeling | testing
        source_url: URL to regulation
        source_title: Title of the regulation
        source_description: Optional description
        key_requirements: User's summary of key requirements
    """
    try:
        source_data = {
            "user_id": user_id,
            "state_code": state_code,
            "regulation_type": regulation_type,
            "source_url": source_url,
            "source_title": source_title,
            "source_description": source_description,
            "key_requirements": key_requirements,
        }
        
        result = supabase.table("user_regulatory_sources") \
            .insert(source_data) \
            .execute()
        
        # Track analytics
        supabase.table("usage_analytics").insert({
            "user_id": user_id,
            "event_type": "source_added",
            "event_data": {"state": state_code, "type": regulation_type},
            "compliance_tier": "basic",
        }).execute()
        
        return [TextContent(
            type="text",
            text=json.dumps({
                "success": True,
                "source_id": result.data[0]["id"],
                "message": f"Added {regulation_type} regulation for {state_code}"
            }, indent=2)
        )]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 3: Basic Compliance Check (Manual - No AI)
# ============================================================================
@app.call_tool()
async def basic_compliance_check(
    user_id: str,
    product_name: str,
    product_type: str,
    target_states: List[str]
) -> List[TextContent]:
    """
    Basic Mode compliance check - returns checklist and sources (no AI)
    
    Args:
        user_id: User ID
        product_name: Product name
        product_type: soil_amendment | fertilizer | compost
        target_states: States to check against
    """
    try:
        # Get user profile
        profile = supabase.table("user_compliance_profiles") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()
        
        if not profile.data:
            return [TextContent(
                type="text",
                text=json.dumps({"error": "User profile not found"})
            )]
        
        user_profile = profile.data[0]
        industry = user_profile["industry"]
        
        # Get user's saved sources
        user_sources = supabase.table("user_regulatory_sources") \
            .select("*") \
            .eq("user_id", user_id) \
            .in_("state_code", target_states) \
            .execute()
        
        # Get suggested sources
        suggested = supabase.table("suggested_regulations") \
            .select("*") \
            .eq("industry", industry) \
            .in_("state_code", target_states) \
            .execute()
        
        # Get industry settings for checklist
        industry_settings = supabase.table("industry_settings") \
            .select("*") \
            .eq("industry", industry) \
            .execute()
        
        # Organize by state
        sources_by_state = {}
        suggested_by_state = {}
        
        for state in target_states:
            sources_by_state[state] = [
                s for s in user_sources.data if s["state_code"] == state
            ]
            suggested_by_state[state] = [
                s for s in suggested.data if s["state_code"] == state
            ]
        
        focus_areas = industry_settings.data[0]["focus_areas"] if industry_settings.data else []
        
        return [TextContent(
            type="text",
            text=json.dumps({
                "product_name": product_name,
                "product_type": product_type,
                "target_states": target_states,
                "regulatory_sources_by_state": sources_by_state,
                "suggested_sources_by_state": suggested_by_state,
                "checklist_items": focus_areas,
                "instructions": "Review each regulatory source and verify your product meets all requirements listed in the checklist.",
            }, indent=2)
        )]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 4: Scrape State Regulation
# ============================================================================
@app.call_tool()
async def scrape_state_regulation(
    state_code: str,
    regulation_type: str,
    source_url: str
) -> List[TextContent]:
    """
    Scrape regulation text from a state government website
    
    Args:
        state_code: Two-letter state code
        regulation_type: Type of regulation
        source_url: URL to scrape
    """
    try:
        # Fetch the page
        headers = {
            'User-Agent': 'MuRP-Compliance-Bot/1.0 (Regulatory Monitoring)'
        }
        response = requests.get(source_url, headers=headers, timeout=15)
        response.raise_for_status()
        
        # Parse HTML
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer"]):
            script.decompose()
        
        # Extract main content
        main_content = soup.find('main') or soup.find('article') or soup.find('div', class_='content')
        if main_content:
            text = main_content.get_text(separator='\n', strip=True)
        else:
            text = soup.get_text(separator='\n', strip=True)
        
        # Clean up whitespace
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        clean_text = '\n'.join(lines)
        
        # Extract key sections (basic pattern matching)
        sections = []
        current_section = []
        
        for line in lines[:500]:  # Limit to first 500 lines
            # Look for section headers
            if any(keyword in line.lower() for keyword in ['section', 'chapter', 'requirement', 'must', 'shall']):
                if current_section:
                    sections.append('\n'.join(current_section))
                current_section = [line]
            else:
                current_section.append(line)
        
        if current_section:
            sections.append('\n'.join(current_section))
        
        return [TextContent(
            type="text",
            text=json.dumps({
                "success": True,
                "state": state_code,
                "source_url": source_url,
                "regulation_type": regulation_type,
                "full_text": clean_text[:10000],  # Limit to 10k chars
                "key_sections": sections[:10],  # Top 10 sections
                "page_title": soup.title.string if soup.title else "Untitled",
                "scraped_at": datetime.now().isoformat(),
            }, indent=2)
        )]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({
                "error": str(e),
                "state": state_code,
                "source_url": source_url
            })
        )]


# ============================================================================
# Tool 5: Extract Text from Label Image (OCR)
# ============================================================================
@app.call_tool()
async def extract_label_text(
    image_url: str,
    product_name: Optional[str] = None
) -> List[TextContent]:
    """
    Extract text from product label using OCR
    
    Args:
        image_url: URL to label image
        product_name: Optional product name for context
    """
    try:
        # Download image
        response = requests.get(image_url, timeout=15)
        response.raise_for_status()
        
        # Save temporarily
        temp_path = f"/tmp/label_{datetime.now().timestamp()}.png"
        with open(temp_path, 'wb') as f:
            f.write(response.content)
        
        # Run OCR
        image = Image.open(temp_path)
        extracted_text = pytesseract.image_to_string(image)
        
        # Clean up
        os.remove(temp_path)
        
        # Parse extracted text for key elements
        lines = [line.strip() for line in extracted_text.splitlines() if line.strip()]
        
        # Look for key patterns
        ingredients = []
        claims = []
        warnings = []
        net_weight = None
        
        for i, line in enumerate(lines):
            line_lower = line.lower()
            
            # Ingredients
            if 'ingredient' in line_lower and i + 1 < len(lines):
                ingredients = lines[i+1:i+10]  # Next 10 lines
            
            # Claims
            if any(claim in line_lower for claim in ['organic', 'omri', 'natural', 'certified']):
                claims.append(line)
            
            # Warnings
            if any(warn in line_lower for warn in ['warning', 'caution', 'keep out', 'danger']):
                warnings.append(line)
            
            # Net weight
            if 'net' in line_lower and any(unit in line_lower for unit in ['lb', 'oz', 'kg', 'g']):
                net_weight = line
        
        return [TextContent(
            type="text",
            text=json.dumps({
                "success": True,
                "product_name": product_name,
                "full_text": extracted_text,
                "parsed_data": {
                    "ingredients": [ing for ing in ingredients if len(ing) > 3][:10],
                    "claims": claims[:10],
                    "warnings": warnings[:5],
                    "net_weight": net_weight,
                },
                "line_count": len(lines),
                "extracted_at": datetime.now().isoformat(),
            }, indent=2)
        )]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({
                "error": str(e),
                "image_url": image_url
            })
        )]


# ============================================================================
# Tool 6: Full AI Compliance Check
# ============================================================================
@app.call_tool()
async def full_ai_compliance_check(
    user_id: str,
    product_name: str,
    product_type: str,
    target_states: List[str],
    label_image_url: Optional[str] = None,
    ingredients: Optional[List[str]] = None,
    claims: Optional[List[str]] = None,
    certifications: Optional[List[str]] = None,
    bom_info: Optional[str] = None
) -> List[TextContent]:
    """
    Full AI Mode compliance check with automated analysis
    
    Args:
        user_id: User ID
        product_name: Product name
        product_type: Type of product
        target_states: States to check
        label_image_url: Optional label image for OCR
        ingredients: Optional ingredient list
        claims: Optional claims list
        certifications: Optional certifications
        bom_info: Optional BOM/recipe information
    """
    try:
        # Check user tier and limits
        profile = supabase.table("user_compliance_profiles") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()
        
        if not profile.data:
            return [TextContent(
                type="text",
                text=json.dumps({"error": "User profile not found"})
            )]
        
        user_profile = profile.data[0]
        
        # Check access
        if user_profile["compliance_tier"] == "basic" and user_profile["trial_checks_remaining"] <= 0:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "error": "Upgrade to Full AI mode required",
                    "trial_checks_remaining": 0
                })
            )]
        
        # Check monthly limit for paid users
        if (user_profile["compliance_tier"] == "full_ai" and 
            user_profile["checks_this_month"] >= user_profile["monthly_check_limit"]):
            return [TextContent(
                type="text",
                text=json.dumps({
                    "error": "Monthly check limit reached",
                    "limit": user_profile["monthly_check_limit"]
                })
            )]
        
        # Extract text from label if provided
        extracted_data = None
        if label_image_url:
            ocr_result = await extract_label_text(label_image_url, product_name)
            ocr_data = json.loads(ocr_result[0].text)
            if ocr_data.get("success"):
                extracted_data = ocr_data["parsed_data"]
                ingredients = ingredients or extracted_data.get("ingredients", [])
                claims = claims or extracted_data.get("claims", [])
        
        # Get relevant regulations
        industry = user_profile["industry"]
        industry_settings = supabase.table("industry_settings") \
            .select("*") \
            .eq("industry", industry) \
            .execute()
        
        industry_data = industry_settings.data[0] if industry_settings.data else {}
        keywords = industry_data.get("search_keywords", [])
        
        # Fetch regulations with keyword filtering
        regulations = supabase.table("state_regulations") \
            .select("*") \
            .in_("state", target_states) \
            .eq("status", "active") \
            .limit(50) \
            .execute()
        
        # Build AI prompt
        reg_context = "\n\n".join([
            f"**{reg['state']} - {reg['rule_title']}**\n"
            f"Category: {reg['category']}\n"
            f"Code: {reg.get('regulation_code', 'N/A')}\n"
            f"Requirement: {reg['rule_text'][:500]}..."
            for reg in regulations.data[:20]
        ])
        
        industry_context = industry_data.get("industry_prompt_context", "")
        focus_areas = industry_data.get("focus_areas", [])
        
        prompt = f"""You are a compliance expert analyzing a product label for regulatory violations.

**Product Information:**
- Product Name: {product_name}
- Product Type: {product_type}
- States: {', '.join(target_states)}
- Ingredients: {', '.join(ingredients or [])}
- Claims: {', '.join(claims or [])}
- Certifications: {', '.join(certifications or [])}
- BOM/Recipe: {bom_info or 'Not provided'}

**Industry Context:**
{industry_context}

**Key Focus Areas:**
{chr(10).join('- ' + area for area in focus_areas)}

**Applicable Regulations:**
{reg_context}

**Your Task:**
Analyze this product for compliance issues. Return your analysis in this JSON structure:

{{
  "overall_compliant": true/false,
  "confidence_score": 0.0-1.0,
  "issues": [
    {{
      "severity": "critical|high|medium|low",
      "state": "state code",
      "regulation": "regulation code or title",
      "finding": "specific issue found",
      "recommendation": "how to fix it"
    }}
  ],
  "compliant_elements": [
    "list of things that ARE compliant"
  ],
  "recommendations": [
    "general recommendations for improvement"
  ]
}}

Be specific and cite exact regulation codes. Focus on high-impact issues first."""

        # Call Claude API
        message = anthropic.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            temperature=0.3,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )
        
        ai_response = message.content[0].text
        
        # Parse AI response
        try:
            analysis = json.loads(ai_response)
        except:
            # If not valid JSON, wrap it
            analysis = {
                "overall_compliant": False,
                "confidence_score": 0.5,
                "raw_response": ai_response,
            }
        
        # Save compliance check
        check_record = {
            "user_id": user_id,
            "product_name": product_name,
            "product_type": product_type,
            "check_tier": "full_ai",
            "industry": industry,
            "states_checked": target_states,
            "extracted_ingredients": ingredients or [],
            "extracted_claims": claims or [],
            "overall_status": "pass" if analysis.get("overall_compliant") else "fail",
            "violations": analysis.get("issues", []),
            "ai_confidence_score": analysis.get("confidence_score"),
            "ai_model_used": "claude-3-5-sonnet",
        }
        
        supabase.table("compliance_checks").insert(check_record).execute()
        
        # Update usage
        if user_profile["compliance_tier"] == "basic":
            supabase.table("user_compliance_profiles").update({
                "trial_checks_remaining": user_profile["trial_checks_remaining"] - 1
            }).eq("user_id", user_id).execute()
        else:
            supabase.table("user_compliance_profiles").update({
                "checks_this_month": user_profile["checks_this_month"] + 1,
                "total_checks_lifetime": user_profile["total_checks_lifetime"] + 1
            }).eq("user_id", user_id).execute()
        
        # Track analytics
        supabase.table("usage_analytics").insert({
            "user_id": user_id,
            "event_type": "check_run",
            "event_data": {
                "compliant": analysis.get("overall_compliant"),
                "issues_count": len(analysis.get("issues", []))
            },
            "compliance_tier": user_profile["compliance_tier"]
        }).execute()
        
        return [TextContent(
            type="text",
            text=json.dumps({
                "success": True,
                "user_id": user_id,
                "product_name": product_name,
                "analysis": analysis,
                "checks_remaining": user_profile.get("trial_checks_remaining", 0) - 1 if user_profile["compliance_tier"] == "basic" else None,
                "checks_this_month": user_profile.get("checks_this_month", 0) + 1 if user_profile["compliance_tier"] == "full_ai" else None
            }, indent=2)
        )]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({
                "error": str(e),
                "user_id": user_id,
                "product_name": product_name
            })
        )]


# ============================================================================
# Tool 7: Upgrade to Full AI
# ============================================================================
@app.call_tool()
async def upgrade_to_full_ai(
    user_id: str,
    stripe_customer_id: Optional[str] = None
) -> List[TextContent]:
    """
    Upgrade user from Basic to Full AI tier
    
    Args:
        user_id: User ID
        stripe_customer_id: Optional Stripe customer ID
    """
    try:
        result = supabase.table("user_compliance_profiles").update({
            "compliance_tier": "full_ai",
            "subscription_status": "active",
            "subscription_start_date": datetime.now().isoformat(),
            "stripe_customer_id": stripe_customer_id,
            "monthly_check_limit": 50,
            "checks_this_month": 0
        }).eq("user_id", user_id).execute()
        
        # Track upgrade
        supabase.table("usage_analytics").insert({
            "user_id": user_id,
            "event_type": "upgraded_to_full_ai",
            "compliance_tier": "full_ai"
        }).execute()
        
        return [TextContent(
            type="text",
            text=json.dumps({
                "success": True,
                "user_id": user_id,
                "tier": "full_ai",
                "monthly_check_limit": 50,
                "message": "Upgraded to Full AI mode successfully"
            }, indent=2)
        )]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 8: Get Compliance Summary
# ============================================================================
@app.call_tool()
async def get_compliance_summary(
    user_id: str,
    days: int = 30
) -> List[TextContent]:
    """
    Get compliance check summary for user
    
    Args:
        user_id: User ID
        days: Days to look back (default 30)
    """
    try:
        # Get recent checks
        checks = supabase.table("compliance_checks") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("check_date", desc=True) \
            .limit(100) \
            .execute()
        
        # Calculate stats
        total_checks = len(checks.data)
        passing = sum(1 for c in checks.data if c.get("overall_status") == "pass")
        failing = sum(1 for c in checks.data if c.get("overall_status") == "fail")
        
        # Get user profile
        profile = supabase.table("user_compliance_profiles") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()
        
        return [TextContent(
            type="text",
            text=json.dumps({
                "user_id": user_id,
                "tier": profile.data[0]["compliance_tier"] if profile.data else "unknown",
                "checks_this_month": profile.data[0]["checks_this_month"] if profile.data else 0,
                "total_checks": total_checks,
                "passing_checks": passing,
                "failing_checks": failing,
                "pass_rate": f"{(passing/total_checks*100):.1f}%" if total_checks > 0 else "N/A",
                "recent_checks": [
                    {
                        "product_name": c["product_name"],
                        "status": c["overall_status"],
                        "date": c["check_date"],
                        "states": c["states_checked"]
                    }
                    for c in checks.data[:10]
                ]
            }, indent=2)
        )]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 9: Check Multi-State Compliance (Prioritizes Strictest)
# ============================================================================
@app.call_tool()
async def check_multi_state_compliance(
    user_id: str,
    product_name: str,
    product_type: str,
    target_states: List[str],
    label_image_url: Optional[str] = None,
    ingredients: Optional[List[str]] = None,
    claims: Optional[List[str]] = None,
    certifications: Optional[List[str]] = None,
    prioritize_strict: bool = True
) -> List[TextContent]:
    """
    Check compliance across multiple states, prioritizing strictest regulations
    
    Args:
        user_id: User ID
        product_name: Product name
        product_type: Type of product
        target_states: List of state codes to check
        label_image_url: Optional label image
        ingredients: Optional ingredient list
        claims: Optional claims list
        certifications: Optional certifications
        prioritize_strict: If true, return strictest state requirements first
    """
    try:
        # Check tier
        profile = supabase.table("user_compliance_profiles") \
            .select("*") \
            .eq("user_id", user_id) \
            .execute()
        
        if not profile.data:
            return [TextContent(
                type="text",
                text=json.dumps({"error": "User profile not found"})
            )]
        
        user_profile = profile.data[0]
        
        # Get state ratings for target states
        state_ratings = supabase.table("state_compliance_ratings") \
            .select("*") \
            .in_("state_code", target_states) \
            .execute()
        
        if not state_ratings.data:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "error": "No state ratings found",
                    "target_states": target_states
                })
            )]
        
        # Sort by strictness if requested
        states_data = state_ratings.data
        if prioritize_strict:
            states_data.sort(key=lambda x: x["strictness_score"], reverse=True)
        
        # Get regulations for all states
        industry = user_profile["industry"]
        industry_settings = supabase.table("industry_settings") \
            .select("*") \
            .eq("industry", industry) \
            .execute()
        
        industry_data = industry_settings.data[0] if industry_settings.data else {}
        keywords = industry_data.get("search_keywords", [])
        
        regulations_by_state = {}
        for state_data in states_data:
            state_code = state_data["state_code"]
            regs = supabase.table("state_regulations") \
                .select("*") \
                .eq("state", state_code) \
                .eq("status", "active") \
                .limit(20) \
                .execute()
            
            regulations_by_state[state_code] = {
                "state_name": state_data["state_name"],
                "strictness_level": state_data["strictness_level"],
                "strictness_score": state_data["strictness_score"],
                "key_focus_areas": state_data["key_focus_areas"],
                "regulations": regs.data,
                "registration_required": state_data["registration_required"],
                "labeling_requirements": state_data["labeling_requirements"]
            }
        
        # Build comprehensive compliance report
        # Identify strictest requirements across all states
        all_requirements = []
        strictest_state = states_data[0] if states_data else None
        
        for state_code, state_info in regulations_by_state.items():
            for reg in state_info["regulations"]:
                all_requirements.append({
                    "state": state_code,
                    "state_name": state_info["state_name"],
                    "strictness": state_info["strictness_score"],
                    "regulation": reg.get("rule_title", ""),
                    "requirement": reg.get("rule_text", "")[:500],
                    "category": reg.get("category", ""),
                    "code": reg.get("regulation_code", "")
                })
        
        # Sort requirements by strictness
        all_requirements.sort(key=lambda x: x["strictness"], reverse=True)
        
        # Extract text from label if provided
        extracted_data = None
        if label_image_url:
            ocr_result = await extract_label_text(label_image_url, product_name)
            ocr_data = json.loads(ocr_result[0].text)
            if ocr_data.get("success"):
                extracted_data = ocr_data["parsed_data"]
                ingredients = ingredients or extracted_data.get("ingredients", [])
                claims = claims or extracted_data.get("claims", [])
        
        # Return comprehensive multi-state analysis
        return [TextContent(
            type="text",
            text=json.dumps({
                "success": True,
                "product_name": product_name,
                "product_type": product_type,
                "states_analyzed": len(target_states),
                "strictest_state": {
                    "code": strictest_state["state_code"],
                    "name": strictest_state["state_name"],
                    "level": strictest_state["strictness_level"],
                    "score": strictest_state["strictness_score"],
                    "key_focus_areas": strictest_state["key_focus_areas"]
                } if strictest_state else None,
                "state_breakdown": regulations_by_state,
                "all_requirements_prioritized": all_requirements[:50],  # Top 50 strictest
                "extracted_label_data": extracted_data,
                "recommendation": (
                    f"Focus on meeting {strictest_state['state_name']} requirements first. "
                    f"As the strictest state (Level: {strictest_state['strictness_level']}), "
                    f"compliance there will likely satisfy most other states."
                ) if strictest_state else "No strictness data available",
                "user_tier": user_profile["compliance_tier"]
            }, indent=2)
        )]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({
                "error": str(e),
                "user_id": user_id,
                "product_name": product_name
            })
        )]


# ============================================================================
# Tool 10: Get State Strictness Rankings
# ============================================================================
@app.call_tool()
async def get_state_strictness_rankings(
    filter_level: Optional[str] = None,
    states: Optional[List[str]] = None
) -> List[TextContent]:
    """
    Get state strictness rankings for compliance planning
    
    Args:
        filter_level: Optional filter by level (Very Strict, Strict, Moderate, Lenient, Very Lenient)
        states: Optional list of state codes to filter
    """
    try:
        query = supabase.table("state_compliance_ratings").select("*")
        
        if filter_level:
            query = query.eq("strictness_level", filter_level)
        
        if states:
            query = query.in_("state_code", states)
        
        result = query.order("strictness_score", desc=True).execute()
        
        # Group by strictness level
        by_level = {
            'Very Strict': [],
            'Strict': [],
            'Moderate': [],
            'Lenient': [],
            'Very Lenient': []
        }
        
        for state in result.data:
            by_level[state["strictness_level"]].append({
                "code": state["state_code"],
                "name": state["state_name"],
                "score": state["strictness_score"],
                "key_focus_areas": state["key_focus_areas"],
                "registration_required": state["registration_required"]
            })
        
        return [TextContent(
            type="text",
            text=json.dumps({
                "total_states": len(result.data),
                "grouped_by_strictness": by_level,
                "recommendation": (
                    "Start with Very Strict states (CA, OR, WA). "
                    "Meeting their requirements will typically satisfy less strict states."
                )
            }, indent=2)
        )]
        
    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 11: Get Ingredient Compliance Status
# ============================================================================
@app.call_tool()
async def get_ingredient_compliance(
    ingredient_sku: str,
    state_codes: Optional[List[str]] = None
) -> List[TextContent]:
    """
    Get compliance status for an ingredient across states

    Args:
        ingredient_sku: SKU of the ingredient to check
        state_codes: Optional list of state codes to filter ['CA', 'OR', 'WA']
    """
    try:
        query = supabase.table("ingredient_compliance_status") \
            .select("*") \
            .eq("ingredient_sku", ingredient_sku)

        if state_codes:
            query = query.in_("state_code", state_codes)

        result = query.order("state_code").execute()

        if not result.data:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "ingredient_sku": ingredient_sku,
                    "status": "unknown",
                    "message": "No compliance data found for this ingredient"
                })
            )]

        # Group by compliance status
        by_status = {
            'compliant': [],
            'restricted': [],
            'prohibited': [],
            'conditional': [],
            'unknown': []
        }

        for record in result.data:
            status = record.get("compliance_status", "unknown")
            by_status[status].append({
                "state_code": record["state_code"],
                "restriction_type": record.get("restriction_type"),
                "restriction_details": record.get("restriction_details"),
                "max_concentration": record.get("max_concentration"),
                "regulation_code": record.get("regulation_code"),
                "sds_status": record.get("sds_status", "missing")
            })

        return [TextContent(
            type="text",
            text=json.dumps({
                "ingredient_sku": ingredient_sku,
                "ingredient_name": result.data[0].get("ingredient_name"),
                "cas_number": result.data[0].get("cas_number"),
                "total_states_checked": len(result.data),
                "by_compliance_status": by_status,
                "has_issues": len(by_status['restricted']) > 0 or len(by_status['prohibited']) > 0
            }, indent=2)
        )]

    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 12: Get Ingredient SDS Information
# ============================================================================
@app.call_tool()
async def get_ingredient_sds(
    ingredient_sku: Optional[str] = None,
    cas_number: Optional[str] = None,
    hazard_code: Optional[str] = None
) -> List[TextContent]:
    """
    Get Safety Data Sheet information for an ingredient

    Args:
        ingredient_sku: SKU of the ingredient
        cas_number: CAS number to search by
        hazard_code: GHS hazard code to filter by (e.g., 'H302')
    """
    try:
        query = supabase.table("ingredient_sds_documents").select("*")

        if ingredient_sku:
            query = query.eq("ingredient_sku", ingredient_sku)
        if cas_number:
            query = query.eq("cas_number", cas_number)
        if hazard_code:
            query = query.contains("ghs_hazard_codes", [hazard_code])

        result = query.eq("status", "active").execute()

        if not result.data:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "found": False,
                    "message": "No SDS document found matching criteria"
                })
            )]

        sds_list = []
        for sds in result.data:
            sds_list.append({
                "ingredient_sku": sds["ingredient_sku"],
                "ingredient_name": sds.get("ingredient_name"),
                "cas_number": sds.get("cas_number"),
                "manufacturer": sds.get("manufacturer_name"),
                "revision_date": sds.get("sds_revision_date"),
                "expiration_date": sds.get("sds_expiration_date"),
                "hazards": {
                    "signal_word": sds.get("signal_word"),
                    "hazard_codes": sds.get("ghs_hazard_codes", []),
                    "precautionary_codes": sds.get("ghs_precautionary_codes", []),
                    "hazard_statements": sds.get("hazard_statements", [])
                },
                "physical_properties": {
                    "state": sds.get("physical_state"),
                    "appearance": sds.get("appearance"),
                    "ph": sds.get("ph"),
                    "flash_point": sds.get("flash_point")
                },
                "file_url": sds.get("sds_file_url"),
                "is_primary": sds.get("is_primary", False)
            })

        return [TextContent(
            type="text",
            text=json.dumps({
                "found": True,
                "count": len(sds_list),
                "sds_documents": sds_list
            }, indent=2)
        )]

    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 13: Check BOM Ingredient Compliance
# ============================================================================
@app.call_tool()
async def check_bom_compliance(
    bom_id: str,
    target_states: List[str]
) -> List[TextContent]:
    """
    Check compliance of all ingredients in a BOM for target states

    Args:
        bom_id: UUID of the BOM to check
        target_states: List of state codes to check ['CA', 'OR', 'WA']
    """
    try:
        # Get BOM details
        bom_result = supabase.table("boms") \
            .select("id, name, finished_sku, components") \
            .eq("id", bom_id) \
            .single() \
            .execute()

        if not bom_result.data:
            return [TextContent(
                type="text",
                text=json.dumps({"error": "BOM not found"})
            )]

        bom = bom_result.data
        components = bom.get("components", [])

        # Check compliance for each ingredient
        issues = {
            "prohibited": [],
            "restricted": [],
            "missing_sds": [],
            "unknown_status": []
        }

        for component in components:
            sku = component.get("sku")
            name = component.get("name", sku)

            # Get compliance status
            compliance_result = supabase.table("ingredient_compliance_status") \
                .select("*") \
                .eq("ingredient_sku", sku) \
                .in_("state_code", target_states) \
                .execute()

            if not compliance_result.data:
                issues["unknown_status"].append({
                    "sku": sku,
                    "name": name,
                    "states": target_states
                })
                continue

            for record in compliance_result.data:
                status = record.get("compliance_status")
                state = record.get("state_code")

                if status == "prohibited":
                    issues["prohibited"].append({
                        "sku": sku,
                        "name": name,
                        "state": state,
                        "details": record.get("restriction_details")
                    })
                elif status == "restricted":
                    issues["restricted"].append({
                        "sku": sku,
                        "name": name,
                        "state": state,
                        "restriction": record.get("restriction_type"),
                        "details": record.get("restriction_details"),
                        "max_concentration": record.get("max_concentration")
                    })

                if record.get("sds_status") == "missing":
                    issues["missing_sds"].append({
                        "sku": sku,
                        "name": name
                    })

        # Determine overall status
        if issues["prohibited"]:
            overall_status = "non_compliant"
        elif issues["restricted"]:
            overall_status = "needs_attention"
        elif issues["unknown_status"] or issues["missing_sds"]:
            overall_status = "pending_review"
        else:
            overall_status = "compliant"

        return [TextContent(
            type="text",
            text=json.dumps({
                "bom_id": bom_id,
                "bom_name": bom["name"],
                "finished_sku": bom["finished_sku"],
                "target_states": target_states,
                "total_ingredients": len(components),
                "overall_status": overall_status,
                "issues": issues,
                "recommendations": _generate_compliance_recommendations(issues)
            }, indent=2)
        )]

    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


def _generate_compliance_recommendations(issues: dict) -> List[str]:
    """Generate actionable recommendations based on compliance issues"""
    recommendations = []

    if issues["prohibited"]:
        skus = list(set(i["sku"] for i in issues["prohibited"]))
        recommendations.append(
            f"CRITICAL: Remove or replace {len(skus)} prohibited ingredient(s): {', '.join(skus)}"
        )

    if issues["restricted"]:
        recommendations.append(
            f"Review {len(issues['restricted'])} restricted ingredient(s) for concentration limits"
        )

    if issues["missing_sds"]:
        skus = list(set(i["sku"] for i in issues["missing_sds"]))
        recommendations.append(
            f"Obtain SDS documents for {len(skus)} ingredient(s): {', '.join(skus[:5])}"
        )

    if issues["unknown_status"]:
        recommendations.append(
            f"Research compliance status for {len(issues['unknown_status'])} ingredient(s) with unknown status"
        )

    if not recommendations:
        recommendations.append("All ingredients appear compliant for target states")

    return recommendations


# ============================================================================
# Tool 14: Search for Problematic Ingredients
# ============================================================================
@app.call_tool()
async def search_problematic_ingredients(
    state_code: str,
    include_restricted: bool = True
) -> List[TextContent]:
    """
    Get all prohibited and optionally restricted ingredients for a state

    Args:
        state_code: Two-letter state code (e.g., 'CA')
        include_restricted: Include restricted ingredients (default True)
    """
    try:
        statuses = ["prohibited"]
        if include_restricted:
            statuses.extend(["restricted", "conditional"])

        result = supabase.table("ingredient_compliance_status") \
            .select("*") \
            .eq("state_code", state_code) \
            .in_("compliance_status", statuses) \
            .order("compliance_status") \
            .execute()

        # Group by status
        by_status = {}
        for record in result.data:
            status = record["compliance_status"]
            if status not in by_status:
                by_status[status] = []
            by_status[status].append({
                "sku": record["ingredient_sku"],
                "name": record.get("ingredient_name"),
                "cas_number": record.get("cas_number"),
                "restriction_type": record.get("restriction_type"),
                "details": record.get("restriction_details"),
                "max_concentration": record.get("max_concentration"),
                "regulation": record.get("regulation_code")
            })

        return [TextContent(
            type="text",
            text=json.dumps({
                "state_code": state_code,
                "total_flagged": len(result.data),
                "by_status": by_status,
                "warning": f"Using these ingredients in {state_code} requires careful review"
            }, indent=2)
        )]

    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 15: Find BOMs Using Ingredient (Cross-Use Analysis)
# ============================================================================
@app.call_tool()
async def find_boms_using_ingredient(
    ingredient_sku: str
) -> List[TextContent]:
    """
    Find all BOMs that use a specific ingredient (for impact analysis)

    Args:
        ingredient_sku: SKU of the ingredient to search for
    """
    try:
        # Get all BOMs with components
        result = supabase.table("boms") \
            .select("id, name, finished_sku, components") \
            .not_("components", "is", "null") \
            .execute()

        using_boms = []
        for bom in result.data:
            components = bom.get("components", [])
            for component in components:
                if component.get("sku") == ingredient_sku:
                    using_boms.append({
                        "bom_id": bom["id"],
                        "bom_name": bom["name"],
                        "finished_sku": bom["finished_sku"],
                        "quantity_used": component.get("quantity")
                    })
                    break

        # Get compliance issues for this ingredient
        compliance_result = supabase.table("ingredient_compliance_status") \
            .select("state_code, compliance_status, restriction_details") \
            .eq("ingredient_sku", ingredient_sku) \
            .in_("compliance_status", ["prohibited", "restricted"]) \
            .execute()

        return [TextContent(
            type="text",
            text=json.dumps({
                "ingredient_sku": ingredient_sku,
                "used_in_boms": len(using_boms),
                "boms": using_boms,
                "compliance_issues": compliance_result.data,
                "impact_warning": f"Changes to this ingredient affect {len(using_boms)} product(s)"
            }, indent=2)
        )]

    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 16: Research Ingredient Regulations (Perplexity)
# ============================================================================
@app.call_tool()
async def research_ingredient_regulations(
    ingredient_name: str,
    state_codes: List[str],
    cas_number: Optional[str] = None,
    regulation_type: str = "fertilizer"
) -> List[TextContent]:
    """
    Research ingredient regulations using Perplexity API for state-by-state compliance data.
    This tool helps build the ingredient compliance database by researching:
    - State-specific restrictions and prohibitions
    - Maximum concentration limits
    - Required disclosures and labeling
    - Relevant regulation codes

    Args:
        ingredient_name: Name of the ingredient to research
        state_codes: List of state codes to research ['CA', 'OR', 'WA']
        cas_number: Optional CAS number for more precise results
        regulation_type: Type of regulation (fertilizer, organic, soil_amendment, pesticide)
    """
    try:
        import httpx

        perplexity_api_key = os.getenv("PERPLEXITY_API_KEY")
        if not perplexity_api_key:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "error": "PERPLEXITY_API_KEY not configured",
                    "fallback": "Manual research required for ingredient regulations"
                })
            )]

        # Build research query
        states_str = ", ".join(state_codes)
        cas_str = f" (CAS: {cas_number})" if cas_number else ""

        query = f"""Research {regulation_type} regulations for the ingredient "{ingredient_name}"{cas_str} in these US states: {states_str}.

For each state, find:
1. Is this ingredient allowed, restricted, or prohibited?
2. If restricted, what are the maximum concentration limits?
3. What labeling requirements apply?
4. What is the relevant regulation code or statute reference?
5. Are there any special permits or conditions required?

Focus on agricultural/fertilizer product regulations, not consumer safety regulations.
Provide specific regulation citations where available."""

        # Call Perplexity Sonar API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.perplexity.ai/chat/completions",
                headers={
                    "Authorization": f"Bearer {perplexity_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "sonar",
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are an expert in US agricultural and fertilizer regulations. Provide accurate, citation-backed information about ingredient restrictions by state. Format responses as structured data when possible."
                        },
                        {
                            "role": "user",
                            "content": query
                        }
                    ],
                    "max_tokens": 2000,
                    "temperature": 0.1,
                    "return_citations": True
                },
                timeout=60.0
            )

            if response.status_code != 200:
                return [TextContent(
                    type="text",
                    text=json.dumps({
                        "error": f"Perplexity API error: {response.status_code}",
                        "details": response.text
                    })
                )]

            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            citations = result.get("citations", [])

            return [TextContent(
                type="text",
                text=json.dumps({
                    "ingredient_name": ingredient_name,
                    "cas_number": cas_number,
                    "states_researched": state_codes,
                    "regulation_type": regulation_type,
                    "research_findings": content,
                    "citations": citations,
                    "next_steps": [
                        "Review findings and extract compliance status per state",
                        "Call set_ingredient_compliance to store each state's status",
                        "Call store_sds_document if SDS info was found"
                    ]
                }, indent=2)
            )]

    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 17: Bulk Populate Ingredient Compliance from Research
# ============================================================================
@app.call_tool()
async def set_ingredient_compliance(
    ingredient_sku: str,
    ingredient_name: str,
    state_code: str,
    compliance_status: str,
    cas_number: Optional[str] = None,
    restriction_type: Optional[str] = None,
    restriction_details: Optional[str] = None,
    max_concentration: Optional[float] = None,
    concentration_unit: str = "percent",
    regulation_code: Optional[str] = None
) -> List[TextContent]:
    """
    Set compliance status for an ingredient in a specific state.
    Use after researching regulations to populate the database.

    Args:
        ingredient_sku: SKU of the ingredient
        ingredient_name: Name of the ingredient
        state_code: Two-letter state code
        compliance_status: compliant, restricted, prohibited, conditional, unknown
        cas_number: Optional CAS number
        restriction_type: banned, limited_use, special_permit, concentration_limit
        restriction_details: Human-readable restriction explanation
        max_concentration: Maximum allowed concentration if restricted
        concentration_unit: percent, ppm, or ppb
        regulation_code: Legal citation (e.g., "CCR Title 3, Section 2303")
    """
    try:
        data = {
            "ingredient_sku": ingredient_sku,
            "ingredient_name": ingredient_name,
            "state_code": state_code,
            "compliance_status": compliance_status,
            "cas_number": cas_number,
            "restriction_type": restriction_type,
            "restriction_details": restriction_details,
            "max_concentration": max_concentration,
            "concentration_unit": concentration_unit,
            "regulation_code": regulation_code,
            "sds_required": True,
            "sds_status": "missing"
        }

        result = supabase.table("ingredient_compliance_status") \
            .upsert(data, on_conflict="ingredient_sku,state_code") \
            .execute()

        return [TextContent(
            type="text",
            text=json.dumps({
                "success": True,
                "ingredient_sku": ingredient_sku,
                "state_code": state_code,
                "compliance_status": compliance_status,
                "message": f"Compliance status set for {ingredient_name} in {state_code}"
            }, indent=2)
        )]

    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 18: Research SDS and Hazard Data (Perplexity)
# ============================================================================
@app.call_tool()
async def research_ingredient_sds(
    ingredient_name: str,
    manufacturer: Optional[str] = None,
    cas_number: Optional[str] = None
) -> List[TextContent]:
    """
    Research SDS and hazard information for an ingredient using Perplexity.
    Finds GHS hazard codes, signal words, and safety information.

    Args:
        ingredient_name: Name of the ingredient
        manufacturer: Optional manufacturer name
        cas_number: Optional CAS number for precise identification
    """
    try:
        import httpx

        perplexity_api_key = os.getenv("PERPLEXITY_API_KEY")
        if not perplexity_api_key:
            return [TextContent(
                type="text",
                text=json.dumps({
                    "error": "PERPLEXITY_API_KEY not configured",
                    "fallback": "Use fetch_external_sds for manual SDS lookup"
                })
            )]

        # Build research query
        mfr_str = f" manufactured by {manufacturer}" if manufacturer else ""
        cas_str = f" (CAS Number: {cas_number})" if cas_number else ""

        query = f"""Find Safety Data Sheet (SDS) information for the ingredient "{ingredient_name}"{mfr_str}{cas_str}.

Provide:
1. CAS Number (if not provided)
2. GHS Hazard Classification:
   - Signal word (Danger or Warning)
   - H-codes (hazard statements like H302, H315, etc.)
   - P-codes (precautionary statements)
3. Physical properties:
   - Physical state (solid, liquid, gas)
   - Appearance
   - pH (if applicable)
   - Flash point
4. Primary health and environmental hazards
5. URL to official SDS if available

Focus on agricultural-grade or industrial-grade products if available."""

        # Call Perplexity Sonar API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.perplexity.ai/chat/completions",
                headers={
                    "Authorization": f"Bearer {perplexity_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "sonar",
                    "messages": [
                        {
                            "role": "system",
                            "content": "You are an expert in chemical safety and SDS documentation. Provide accurate GHS hazard classifications and safety data. When citing H-codes and P-codes, use the standard GHS format."
                        },
                        {
                            "role": "user",
                            "content": query
                        }
                    ],
                    "max_tokens": 1500,
                    "temperature": 0.1,
                    "return_citations": True
                },
                timeout=60.0
            )

            if response.status_code != 200:
                return [TextContent(
                    type="text",
                    text=json.dumps({
                        "error": f"Perplexity API error: {response.status_code}",
                        "details": response.text
                    })
                )]

            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            citations = result.get("citations", [])

            return [TextContent(
                type="text",
                text=json.dumps({
                    "ingredient_name": ingredient_name,
                    "manufacturer": manufacturer,
                    "cas_number": cas_number,
                    "sds_research": content,
                    "citations": citations,
                    "next_steps": [
                        "Extract GHS hazard codes from research",
                        "Call store_sds_document to save the data",
                        "Verify critical hazard info against official SDS"
                    ]
                }, indent=2)
            )]

    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 19: Fetch External SDS (Agentic Discovery)
# ============================================================================
@app.call_tool()
async def fetch_external_sds(
    ingredient_name: str,
    manufacturer: Optional[str] = None,
    cas_number: Optional[str] = None
) -> List[TextContent]:
    """
    Search for SDS documents from external sources (for agentic discovery)

    Args:
        ingredient_name: Name of the ingredient to search for
        manufacturer: Optional manufacturer name to narrow search
        cas_number: Optional CAS number for precise identification
    """
    try:
        # Build search query
        search_terms = [ingredient_name, "SDS", "Safety Data Sheet"]
        if manufacturer:
            search_terms.insert(0, manufacturer)
        if cas_number:
            search_terms.append(cas_number)

        search_query = " ".join(search_terms)

        # Known SDS databases to check
        sds_sources = [
            {
                "name": "PubChem",
                "url_template": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cas_number}" if cas_number else None,
                "type": "database"
            },
            {
                "name": "ChemSpider",
                "url_template": f"https://www.chemspider.com/Search.aspx?q={cas_number}" if cas_number else None,
                "type": "database"
            },
            {
                "name": "MSDS Online",
                "url_template": f"https://www.msdsonline.com/search/?q={ingredient_name.replace(' ', '+')}",
                "type": "aggregator"
            }
        ]

        # Filter to only valid URLs
        available_sources = [s for s in sds_sources if s["url_template"]]

        return [TextContent(
            type="text",
            text=json.dumps({
                "search_query": search_query,
                "ingredient_name": ingredient_name,
                "cas_number": cas_number,
                "manufacturer": manufacturer,
                "suggested_sources": available_sources,
                "action_required": "Use Perplexity or web search to find and download SDS from these sources",
                "next_step": "After obtaining SDS, call store_sds_document to save it"
            }, indent=2)
        )]

    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Tool 17: Store SDS Document
# ============================================================================
@app.call_tool()
async def store_sds_document(
    ingredient_sku: str,
    ingredient_name: str,
    cas_number: Optional[str] = None,
    manufacturer_name: Optional[str] = None,
    sds_file_url: Optional[str] = None,
    sds_source: str = "manual_entry",
    sds_revision_date: Optional[str] = None,
    ghs_hazard_codes: Optional[List[str]] = None,
    signal_word: Optional[str] = None,
    hazard_statements: Optional[List[str]] = None
) -> List[TextContent]:
    """
    Store an SDS document for an ingredient

    Args:
        ingredient_sku: SKU of the ingredient
        ingredient_name: Name of the ingredient
        cas_number: CAS number (optional)
        manufacturer_name: Manufacturer name (optional)
        sds_file_url: URL to the SDS file (optional)
        sds_source: Source type (uploaded, scraped, api, manual_entry)
        sds_revision_date: Date of SDS revision (YYYY-MM-DD)
        ghs_hazard_codes: List of GHS hazard codes ['H302', 'H315']
        signal_word: 'Danger' or 'Warning'
        hazard_statements: List of hazard statements
    """
    try:
        # Check if primary SDS exists, and update it
        existing = supabase.table("ingredient_sds_documents") \
            .select("id") \
            .eq("ingredient_sku", ingredient_sku) \
            .eq("is_primary", True) \
            .execute()

        sds_data = {
            "ingredient_sku": ingredient_sku,
            "ingredient_name": ingredient_name,
            "cas_number": cas_number,
            "manufacturer_name": manufacturer_name,
            "sds_file_url": sds_file_url,
            "sds_source": sds_source,
            "sds_revision_date": sds_revision_date,
            "ghs_hazard_codes": ghs_hazard_codes or [],
            "ghs_precautionary_codes": [],
            "signal_word": signal_word,
            "hazard_statements": hazard_statements or [],
            "status": "active",
            "is_primary": True
        }

        if existing.data:
            # Update existing
            result = supabase.table("ingredient_sds_documents") \
                .update(sds_data) \
                .eq("id", existing.data[0]["id"]) \
                .execute()
            action = "updated"
        else:
            # Insert new
            result = supabase.table("ingredient_sds_documents") \
                .insert(sds_data) \
                .execute()
            action = "created"

        # Update compliance status to reflect SDS availability
        supabase.table("ingredient_compliance_status") \
            .update({"sds_status": "current"}) \
            .eq("ingredient_sku", ingredient_sku) \
            .execute()

        return [TextContent(
            type="text",
            text=json.dumps({
                "success": True,
                "action": action,
                "ingredient_sku": ingredient_sku,
                "has_hazards": bool(ghs_hazard_codes),
                "signal_word": signal_word,
                "message": f"SDS document {action} for {ingredient_name}"
            }, indent=2)
        )]

    except Exception as e:
        return [TextContent(
            type="text",
            text=json.dumps({"error": str(e)})
        )]


# ============================================================================
# Main Server Entry Point
# ============================================================================
async def main():
    """Run the MCP server"""
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
