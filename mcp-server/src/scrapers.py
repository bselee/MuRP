"""
Regulation Scraper Utilities
State-specific scrapers for common regulatory sources
"""

import requests
from bs4 import BeautifulSoup
from typing import Dict, List, Optional
from datetime import datetime


class StateRegulationScraper:
    """Base class for state regulation scrapers"""
    
    def __init__(self):
        self.headers = {
            'User-Agent': 'TGF-Compliance-Bot/1.0 (Regulatory Monitoring)'
        }
    
    def fetch_page(self, url: str) -> Optional[BeautifulSoup]:
        """Fetch and parse a webpage"""
        try:
            response = requests.get(url, headers=self.headers, timeout=15)
            response.raise_for_status()
            return BeautifulSoup(response.content, 'html.parser')
        except Exception as e:
            print(f"Error fetching {url}: {e}")
            return None
    
    def clean_text(self, soup: BeautifulSoup) -> str:
        """Extract and clean text from HTML"""
        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'footer', 'header']):
            element.decompose()
        
        # Get text
        text = soup.get_text(separator='\n', strip=True)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        return '\n'.join(lines)


class ColoradoScraper(StateRegulationScraper):
    """Colorado agriculture regulations"""
    
    SOURCES = {
        'organic': 'https://ag.colorado.gov/plants/organic',
        'fertilizer': 'https://ag.colorado.gov/plants/commercial-feed-fertilizer-and-seed',
        'pesticides': 'https://ag.colorado.gov/plants/pesticides',
    }
    
    def scrape_organic_regs(self) -> Dict:
        """Scrape CO organic regulations"""
        url = self.SOURCES['organic']
        soup = self.fetch_page(url)
        
        if not soup:
            return {"error": "Failed to fetch page"}
        
        text = self.clean_text(soup)
        
        # Extract key sections
        sections = []
        current_section = []
        
        for line in text.split('\n'):
            if any(kw in line.lower() for kw in ['certification', 'omri', 'requirement', 'must']):
                if current_section:
                    sections.append('\n'.join(current_section))
                current_section = [line]
            elif current_section:
                current_section.append(line)
        
        return {
            "state": "CO",
            "type": "organic",
            "source_url": url,
            "full_text": text[:10000],
            "key_sections": sections[:10],
            "scraped_at": datetime.now().isoformat()
        }
    
    def scrape_fertilizer_regs(self) -> Dict:
        """Scrape CO fertilizer regulations"""
        url = self.SOURCES['fertilizer']
        soup = self.fetch_page(url)
        
        if not soup:
            return {"error": "Failed to fetch page"}
        
        text = self.clean_text(soup)
        
        return {
            "state": "CO",
            "type": "fertilizer",
            "source_url": url,
            "full_text": text[:10000],
            "scraped_at": datetime.now().isoformat()
        }


class CaliforniaScraper(StateRegulationScraper):
    """California agriculture regulations"""
    
    SOURCES = {
        'organic': 'https://www.cdfa.ca.gov/is/organic/',
        'fertilizer': 'https://www.cdfa.ca.gov/is/ffldrs/',
        'pesticides': 'https://www.cdpr.ca.gov/',
    }
    
    def scrape_organic_regs(self) -> Dict:
        """Scrape CA organic regulations"""
        url = self.SOURCES['organic']
        soup = self.fetch_page(url)
        
        if not soup:
            return {"error": "Failed to fetch page"}
        
        text = self.clean_text(soup)
        
        return {
            "state": "CA",
            "type": "organic",
            "source_url": url,
            "full_text": text[:10000],
            "scraped_at": datetime.now().isoformat()
        }
    
    def scrape_fertilizer_regs(self) -> Dict:
        """Scrape CA fertilizer regulations"""
        url = self.SOURCES['fertilizer']
        soup = self.fetch_page(url)
        
        if not soup:
            return {"error": "Failed to fetch page"}
        
        text = self.clean_text(soup)
        
        # Look for specific CA requirements
        requirements = []
        for line in text.split('\n'):
            if 'label' in line.lower() and any(kw in line.lower() for kw in ['must', 'shall', 'require']):
                requirements.append(line)
        
        return {
            "state": "CA",
            "type": "fertilizer",
            "source_url": url,
            "full_text": text[:10000],
            "key_requirements": requirements[:20],
            "scraped_at": datetime.now().isoformat()
        }


class WashingtonScraper(StateRegulationScraper):
    """Washington agriculture regulations"""
    
    SOURCES = {
        'organic': 'https://agr.wa.gov/departments/organic',
        'fertilizer': 'https://agr.wa.gov/departments/pesticides-and-fertilizers/fertilizers',
    }
    
    def scrape_organic_regs(self) -> Dict:
        """Scrape WA organic regulations"""
        url = self.SOURCES['organic']
        soup = self.fetch_page(url)
        
        if not soup:
            return {"error": "Failed to fetch page"}
        
        text = self.clean_text(soup)
        
        return {
            "state": "WA",
            "type": "organic",
            "source_url": url,
            "full_text": text[:10000],
            "scraped_at": datetime.now().isoformat()
        }


class OregonScraper(StateRegulationScraper):
    """Oregon agriculture regulations"""
    
    SOURCES = {
        'organic': 'https://www.oregon.gov/oda/programs/organic/pages/default.aspx',
        'fertilizer': 'https://www.oregon.gov/oda/programs/foodsafety/pages/fertilizers.aspx',
    }
    
    def scrape_organic_regs(self) -> Dict:
        """Scrape OR organic regulations"""
        url = self.SOURCES['organic']
        soup = self.fetch_page(url)
        
        if not soup:
            return {"error": "Failed to fetch page"}
        
        text = self.clean_text(soup)
        
        return {
            "state": "OR",
            "type": "organic",
            "source_url": url,
            "full_text": text[:10000],
            "scraped_at": datetime.now().isoformat()
        }


# Factory function
def get_scraper(state_code: str) -> Optional[StateRegulationScraper]:
    """Get appropriate scraper for state"""
    scrapers = {
        'CO': ColoradoScraper,
        'CA': CaliforniaScraper,
        'WA': WashingtonScraper,
        'OR': OregonScraper,
    }
    
    scraper_class = scrapers.get(state_code.upper())
    return scraper_class() if scraper_class else None


# Example usage
if __name__ == "__main__":
    # Test Colorado scraper
    scraper = get_scraper('CO')
    if scraper:
        result = scraper.scrape_organic_regs()
        print(f"Scraped {len(result.get('full_text', ''))} characters")
        print(f"Found {len(result.get('key_sections', []))} key sections")
