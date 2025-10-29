import { chromium } from '@playwright/test';

(async () => {
  console.log('🔍 Checking deployment at: https://tgf-n6u4s3ddf-will-selees-projects.vercel.app\n');
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  // Listen for console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      console.log('❌ Console Error:', text);
    } else if (type === 'warning') {
      console.log('⚠️  Console Warning:', text);
    }
  });
  
  // Listen for page errors
  page.on('pageerror', error => {
    console.log('❌ Page Error:', error.message);
  });
  
  try {
    console.log('📡 Loading page...');
    await page.goto('https://tgf-n6u4s3ddf-will-selees-projects.vercel.app', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    console.log('✅ Page loaded successfully\n');
    
    // Wait a bit for React to render
    await page.waitForTimeout(2000);
    
    // Take a screenshot
    await page.screenshot({ path: 'deployment-screenshot.png', fullPage: true });
    console.log('📸 Screenshot saved to deployment-screenshot.png\n');
    
    // Check what's in the body
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('📄 Body text:', bodyText.substring(0, 500));
    console.log('\n');
    
    // Check for specific elements
    const rootElement = await page.$('#root');
    console.log('🔍 Root element found:', !!rootElement);
    
    if (rootElement) {
      const rootHTML = await page.evaluate(() => {
        const root = document.getElementById('root');
        return root ? root.innerHTML.substring(0, 500) : 'empty';
      });
      console.log('🔍 Root HTML:', rootHTML);
    }
    
    // Check if there's any visible content
    const hasContent = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    });
    console.log('📦 Root has children:', hasContent);
    
    // Get computed styles of body
    const bodyBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    console.log('🎨 Body background color:', bodyBg);
    
  } catch (error) {
    console.log('❌ Error during check:', error.message);
  }
  
  await browser.close();
  console.log('\n✅ Check complete');
})();
