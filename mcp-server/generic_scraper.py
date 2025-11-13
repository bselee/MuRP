"""
Generic Web Scraper
Flexible scraping for any .gov or regulatory website
"""
import asyncio
import aiohttp
from bs4 import BeautifulSoup
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import re
from urllib.parse import urljoin, urlparse
import json

@dataclass
class ScrapedData:
    """Standardized scraped data format"""
    url: str
    title: str
    content: str
    metadata: Dict[str, Any]
    links: List[str]
    extracted_fields: Dict[str, Any]

class GenericScraper:
    """Generic web scraper with configurable selectors"""
    
    def __init__(
        self,
        selectors: Optional[Dict[str, str]] = None,
        rate_limit_ms: int = 1000,
        max_retries: int = 3,
        timeout: int = 30,
        user_agent: str = "TGF-MRP Compliance Bot/1.0"
    ):
        self.selectors = selectors or self._default_selectors()
        self.rate_limit_ms = rate_limit_ms
        self.max_retries = max_retries
        self.timeout = timeout
        self.user_agent = user_agent
        self.session: Optional[aiohttp.ClientSession] = None
    
    def _default_selectors(self) -> Dict[str, str]:
        """Default CSS selectors for common page elements"""
        return {
            "title": "h1, h2.page-title, title",
            "content": "main, article, div.content, div.main-content, div#content",
            "date": "time, span.date, span.last-modified, div.date",
            "author": "span.author, div.byline",
            "regulation_code": "span.code, div.citation, span.regulation-number"
        }
    
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession(
            headers={"User-Agent": self.user_agent},
            timeout=aiohttp.ClientTimeout(total=self.timeout)
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
    
    async def scrape_url(
        self,
        url: str,
        custom_selectors: Optional[Dict[str, str]] = None,
        extract_links: bool = True
    ) -> ScrapedData:
        """Scrape a single URL"""
        if not self.session:
            raise RuntimeError("Scraper must be used as async context manager")
        
        selectors = custom_selectors or self.selectors
        
        # Retry logic
        for attempt in range(self.max_retries):
            try:
                async with self.session.get(url) as response:
                    if response.status != 200:
                        if attempt < self.max_retries - 1:
                            await asyncio.sleep(self.rate_limit_ms / 1000 * (attempt + 1))
                            continue
                        else:
                            raise Exception(f"HTTP {response.status}: {url}")
                    
                    html = await response.text()
                    soup = BeautifulSoup(html, 'html.parser')
                    
                    # Extract data using selectors
                    extracted_fields = {}
                    for field, selector in selectors.items():
                        extracted_fields[field] = self._extract_field(soup, selector)
                    
                    # Extract title
                    title = extracted_fields.get("title", "")
                    if not title:
                        title_tag = soup.find("title")
                        title = title_tag.get_text(strip=True) if title_tag else ""
                    
                    # Extract main content
                    content = extracted_fields.get("content", "")
                    if not content:
                        # Fallback: get all text from body
                        body = soup.find("body")
                        content = body.get_text(separator="\n", strip=True) if body else ""
                    
                    # Clean content
                    content = self._clean_text(content)
                    
                    # Extract metadata
                    metadata = self._extract_metadata(soup)
                    
                    # Extract links
                    links = []
                    if extract_links:
                        links = self._extract_links(soup, url)
                    
                    # Rate limiting
                    await asyncio.sleep(self.rate_limit_ms / 1000)
                    
                    return ScrapedData(
                        url=url,
                        title=title,
                        content=content,
                        metadata=metadata,
                        links=links,
                        extracted_fields=extracted_fields
                    )
            
            except asyncio.TimeoutError:
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.rate_limit_ms / 1000 * (attempt + 1))
                    continue
                else:
                    raise Exception(f"Timeout scraping {url}")
            except Exception as e:
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.rate_limit_ms / 1000 * (attempt + 1))
                    continue
                else:
                    raise Exception(f"Error scraping {url}: {str(e)}")
    
    def _extract_field(self, soup: BeautifulSoup, selector: str) -> str:
        """Extract field using CSS selector"""
        # Handle multiple selectors separated by commas
        for sel in selector.split(","):
            sel = sel.strip()
            element = soup.select_one(sel)
            if element:
                return element.get_text(separator=" ", strip=True)
        return ""
    
    def _clean_text(self, text: str) -> str:
        """Clean extracted text"""
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text)
        # Remove navigation junk
        text = re.sub(r'Skip to (main content|navigation)', '', text, flags=re.IGNORECASE)
        return text.strip()
    
    def _extract_metadata(self, soup: BeautifulSoup) -> Dict[str, Any]:
        """Extract metadata from page"""
        metadata = {}
        
        # Extract meta tags
        for meta in soup.find_all("meta"):
            name = meta.get("name") or meta.get("property")
            content = meta.get("content")
            if name and content:
                metadata[name] = content
        
        # Extract structured data (JSON-LD)
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                metadata["structured_data"] = data
            except:
                pass
        
        return metadata
    
    def _extract_links(self, soup: BeautifulSoup, base_url: str) -> List[str]:
        """Extract all links from page"""
        links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            # Convert relative URLs to absolute
            absolute_url = urljoin(base_url, href)
            # Only include http/https links
            if absolute_url.startswith(("http://", "https://")):
                links.append(absolute_url)
        return list(set(links))  # Remove duplicates
    
    async def scrape_multiple(
        self,
        urls: List[str],
        custom_selectors: Optional[Dict[str, str]] = None
    ) -> List[ScrapedData]:
        """Scrape multiple URLs concurrently"""
        tasks = [self.scrape_url(url, custom_selectors) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Filter out exceptions
        successful = [r for r in results if isinstance(r, ScrapedData)]
        return successful
    
    def find_regulation_links(
        self,
        scraped_data: ScrapedData,
        keywords: Optional[List[str]] = None
    ) -> List[str]:
        """Find links that likely contain regulations"""
        keywords = keywords or [
            "regulation", "rule", "code", "statute", "law",
            "requirement", "compliance", "standard", "guideline"
        ]
        
        relevant_links = []
        for link in scraped_data.links:
            link_lower = link.lower()
            # Check if any keyword appears in the URL
            if any(kw in link_lower for kw in keywords):
                relevant_links.append(link)
        
        return relevant_links

class GovSiteScraper:
    """Specialized scraper for government websites"""
    
    def __init__(self):
        self.common_gov_patterns = {
            "california": {
                "cdfa": {
                    "base_url": "https://www.cdfa.ca.gov",
                    "fertilizer": "/is/ffldrs/",
                    "organic": "/is/i_&_c/organic.html"
                },
                "calrecycle": {
                    "base_url": "https://www.calrecycle.ca.gov",
                    "compost": "/organics/compostmulch/"
                }
            },
            "federal": {
                "usda": {
                    "base_url": "https://www.ams.usda.gov",
                    "organic": "/rules-regulations/organic"
                },
                "epa": {
                    "base_url": "https://www.epa.gov",
                    "pesticides": "/pesticide-labels"
                }
            }
        }
    
    def get_common_urls(self, state: str, topic: str) -> List[str]:
        """Get common regulation URLs for state/topic"""
        urls = []
        
        state_lower = state.lower()
        topic_lower = topic.lower()
        
        if state_lower in self.common_gov_patterns:
            state_patterns = self.common_gov_patterns[state_lower]
            for agency, paths in state_patterns.items():
                if topic_lower in paths:
                    url = paths["base_url"] + paths[topic_lower]
                    urls.append(url)
        
        # Add federal URLs
        federal_patterns = self.common_gov_patterns.get("federal", {})
        for agency, paths in federal_patterns.items():
            if topic_lower in paths:
                url = paths["base_url"] + paths[topic_lower]
                urls.append(url)
        
        return urls
    
    async def scrape_state_regulations(
        self,
        state: str,
        topic: str,
        custom_urls: Optional[List[str]] = None
    ) -> List[ScrapedData]:
        """Scrape regulations for a specific state and topic"""
        urls = custom_urls or self.get_common_urls(state, topic)
        
        if not urls:
            print(f"No known URLs for {state} - {topic}")
            return []
        
        async with GenericScraper() as scraper:
            results = await scraper.scrape_multiple(urls)
        
        return results

# Helper function for simple scraping
async def scrape_url_simple(url: str) -> Dict[str, Any]:
    """Simple interface for scraping a single URL"""
    async with GenericScraper() as scraper:
        data = await scraper.scrape_url(url)
        return {
            "url": data.url,
            "title": data.title,
            "content": data.content[:5000],  # Limit content length
            "metadata": data.metadata,
            "links": data.links[:50]  # Limit links
        }

# CLI test function
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python generic_scraper.py <url>")
        sys.exit(1)
    
    url = sys.argv[1]
    
    async def test():
        result = await scrape_url_simple(url)
        print(json.dumps(result, indent=2))
    
    asyncio.run(test())
