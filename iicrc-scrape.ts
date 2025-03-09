import { clear } from 'console';
import { get } from 'http';
import { resolve } from 'path';
import { Browser, BrowserContext, Page, Keyboard, launch } from 'puppeteer';

async function waitFor(page: Page, duration: number = 1000, timeout: number = 30000): Promise<void> {
    const start = Date.now();
    let lastMutationTime = start;

    await page.evaluate((duration: number) => {
        (window as any)._lastMutationTime = Date.now();

        const observer = new MutationObserver(() => {
            (window as any)._lastMutationTime = Date.now();
        });

        observer.observe(document.documentElement, {
            attributes: true,
            childList: true,
            subtree: true,
            characterData: true
        });

        (window as any)._mutationObserver = observer;
    }, duration);

    while (Date.now() - start < timeout) {
        await new Promise(resolve => setTimeout(resolve, 100));

        lastMutationTime = await page.evaluate(() => (window as any)._lastMutationTime);

        if (Date.now() - lastMutationTime >= duration) {
            await page.evaluate(() => {
                if ((window as any)._mutationObserver) {
                    (window as any)._mutationObserver.disconnect();
                    delete (window as any)._mutationObserver;
                    delete (window as any)._lastMutationTime;
                }
            });
            return;
        }
    }

    await page.evaluate(() => {
        if ((window as any)._mutationObserver) {
            (window as any)._mutationObserver.disconnect();
            delete (window as any)._mutationObserver;
            delete (window as any)._lastMutationTime;
        }
    });

    throw new Error('Timeout');
}

(async (): Promise<void> => {
    const browser: Browser = await launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--incognito'
        ]
    });

    const context: BrowserContext = await browser.createBrowserContext({
        downloadBehavior: { policy: 'deny' }
    });

    context.overridePermissions('https://iicrcnetforum.bullseyelocations.com', ['geolocation']);

    const page: Page = await context.newPage();

    try {
        await page.evaluateOnNewDocument(() => {
            const mockGeolocation = {
                getCurrentPosition: (success: PositionCallback, error?: PositionErrorCallback) => {
                    success({
                        coords: {
                            latitude: -33.9249,
                            longitude: 18.4241,
                            accuracy: 10,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            speed: null
                        },
                        timestamp: Date.now()
                    } as GeolocationPosition);
                    if (error) {
                        error({
                            code: 1,
                            message: 'User denied Geolocation'
                        } as GeolocationPositionError);
                    }
                },
                watchPosition: (success: PositionCallback, error?: PositionErrorCallback) => {
                    success({
                        coords: {
                            latitude: -33.9249,
                            longitude: 18.4241,
                            accuracy: 10,
                            altitude: null,
                            altitudeAccuracy: null,
                            heading: null,
                            speed: null
                        },
                        timestamp: Date.now()
                    } as GeolocationPosition);
                    if (error) {
                        error({
                            code: 1,
                            message: 'User denied Geolocation'
                        } as GeolocationPositionError);
                    }
                    return 0;
                },
                clearWatch: () => {}
            };

            Object.defineProperty(navigator, 'geolocation', {
                value: mockGeolocation,
                configurable: true
            });

            Object.defineProperty(Intl, 'DateTimeFormat', {
                value: function() {
                    return {
                        resolvedOptions: () => ({
                            timeZone: 'Africa/Johannesburg',
                            hour12: true,
                            locale: 'en-US'
                        })
                    };
                },
                writable: true
            });
        });

        await page.setGeolocation({ latitude: -33.9249, longitude: 18.4241 });

        const screenrecorder = await page.screencast({
            path: 'screenrecorder.webm'
        });

        await page.goto('https://iicrcnetforum.bullseyelocations.com/pages/iicrc-netforum?f=1', {
            waitUntil: 'networkidle2'
        });

        await waitFor(page, 2000, 30000);

        await page.waitForSelector('select[id="ContentPlaceHolder1_radiusList"]');
        await page.select('select[id="ContentPlaceHolder1_radiusList"]', '250');

        await waitFor(page, 2000, 30000);

        await page.waitForSelector('input[id="txtCityStateZip"]', {visible: true});
        await page.locator('input[id="txtCityStateZip"]').click({clickCount: 3});
        await page.keyboard.press('Backspace');
        await page.type('input[id="txtCityStateZip"]', '32566', {delay: 100});

        await page.waitForSelector('input[id="ContentPlaceHolder1_searchButton2"]',
            {visible: true}
        );
        await page.click('input[id="ContentPlaceHolder1_searchButton2"]');

        await page.waitForNavigation({
            waitUntil: 'networkidle2'
        }).catch(() => {});

        await waitFor(page, 2000, 30000);

        await page.screenshot({
            path: 'search-results.png',
            fullPage: true
        });

        const listings = await page.$$('div.resultsDetails h3[itemprop="name"]');

        if (listings.length === 0) {
            console.log('No listings found');
            await page.screenshot({path: 'no-listings-found.png'});
        } else {
            for (const listing of listings) {
                const name = await page.evaluate((el: Element) => el.textContent, listing);
                console.log(name);
            }
        }
        await screenrecorder.stop();
        await page.close();
    } catch (error) {
        console.error("An error occurred: ", error);
    } finally {
        await browser.close();
    }
})();