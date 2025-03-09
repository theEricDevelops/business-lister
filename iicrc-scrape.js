"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var puppeteer_1 = require("puppeteer");
function waitFor(page_1) {
    return __awaiter(this, arguments, void 0, function (page, duration, timeout) {
        var start, lastMutationTime;
        if (duration === void 0) { duration = 1000; }
        if (timeout === void 0) { timeout = 30000; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    start = Date.now();
                    lastMutationTime = start;
                    return [4 /*yield*/, page.evaluate(function (duration) {
                            window._lastMutationTime = Date.now();
                            var observer = new MutationObserver(function () {
                                window._lastMutationTime = Date.now();
                            });
                            observer.observe(document.documentElement, {
                                attributes: true,
                                childList: true,
                                subtree: true,
                                characterData: true
                            });
                            window._mutationObserver = observer;
                        }, duration)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    if (!(Date.now() - start < timeout)) return [3 /*break*/, 7];
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 100); })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, page.evaluate(function () { return window._lastMutationTime; })];
                case 4:
                    lastMutationTime = _a.sent();
                    if (!(Date.now() - lastMutationTime >= duration)) return [3 /*break*/, 6];
                    return [4 /*yield*/, page.evaluate(function () {
                            if (window._mutationObserver) {
                                window._mutationObserver.disconnect();
                                delete window._mutationObserver;
                                delete window._lastMutationTime;
                            }
                        })];
                case 5:
                    _a.sent();
                    return [2 /*return*/];
                case 6: return [3 /*break*/, 2];
                case 7: return [4 /*yield*/, page.evaluate(function () {
                        if (window._mutationObserver) {
                            window._mutationObserver.disconnect();
                            delete window._mutationObserver;
                            delete window._lastMutationTime;
                        }
                    })];
                case 8:
                    _a.sent();
                    throw new Error('Timeout');
            }
        });
    });
}
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var browser, context, page, screenrecorder, listings, _i, listings_1, listing, name_1, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, puppeteer_1.launch)({
                    headless: false,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--incognito'
                    ]
                })];
            case 1:
                browser = _a.sent();
                return [4 /*yield*/, browser.createBrowserContext({})];
            case 2:
                context = _a.sent();
                context.overridePermissions('https://iicrcnetforum.bullseyelocations.com', ['geolocation']);
                return [4 /*yield*/, context.newPage()];
            case 3:
                page = _a.sent();
                _a.label = 4;
            case 4:
                _a.trys.push([4, 31, 32, 34]);
                return [4 /*yield*/, page.evaluateOnNewDocument(function () {
                        var mockGeolocation = {
                            getCurrentPosition: function (success, error) {
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
                                });
                                if (error) {
                                    error({
                                        code: 1,
                                        message: 'User denied Geolocation'
                                    });
                                }
                            },
                            watchPosition: function (success, error) {
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
                                });
                                if (error) {
                                    error({
                                        code: 1,
                                        message: 'User denied Geolocation'
                                    });
                                }
                                return 0;
                            },
                            clearWatch: function () { }
                        };
                        Object.defineProperty(navigator, 'geolocation', {
                            value: mockGeolocation,
                            configurable: true
                        });
                        Object.defineProperty(Intl, 'DateTimeFormat', {
                            value: function () {
                                return {
                                    resolvedOptions: function () { return ({
                                        timeZone: 'Africa/Johannesburg',
                                        hour12: true,
                                        locale: 'en-US'
                                    }); }
                                };
                            },
                            writable: true
                        });
                    })];
            case 5:
                _a.sent();
                return [4 /*yield*/, page.setGeolocation({ latitude: -33.9249, longitude: 18.4241 })];
            case 6:
                _a.sent();
                return [4 /*yield*/, page.screencast({
                        path: 'screenrecorder.webm'
                    })];
            case 7:
                screenrecorder = _a.sent();
                return [4 /*yield*/, page.goto('https://iicrcnetforum.bullseyelocations.com/pages/iicrc-netforum?f=1', {
                        waitUntil: 'networkidle2'
                    })];
            case 8:
                _a.sent();
                return [4 /*yield*/, waitFor(page, 2000, 30000)];
            case 9:
                _a.sent();
                return [4 /*yield*/, page.waitForSelector('select[id="ContentPlaceHolder1_radiusList"]')];
            case 10:
                _a.sent();
                return [4 /*yield*/, page.select('select[id="ContentPlaceHolder1_radiusList"]', '250')];
            case 11:
                _a.sent();
                return [4 /*yield*/, waitFor(page, 2000, 30000)];
            case 12:
                _a.sent();
                return [4 /*yield*/, page.waitForSelector('input[id="txtCityStateZip"]', { visible: true })];
            case 13:
                _a.sent();
                return [4 /*yield*/, page.locator('input[id="txtCityStateZip"]').click({ clickCount: 3 })];
            case 14:
                _a.sent();
                return [4 /*yield*/, page.keyboard.press('Backspace')];
            case 15:
                _a.sent();
                return [4 /*yield*/, page.type('input[id="txtCityStateZip"]', '32566', { delay: 100 })];
            case 16:
                _a.sent();
                return [4 /*yield*/, page.waitForSelector('input[id="ContentPlaceHolder1_searchButton2"]', { visible: true })];
            case 17:
                _a.sent();
                return [4 /*yield*/, page.click('input[id="ContentPlaceHolder1_searchButton2"]')];
            case 18:
                _a.sent();
                return [4 /*yield*/, page.waitForNavigation({
                        waitUntil: 'networkidle2'
                    }).catch(function () { })];
            case 19:
                _a.sent();
                return [4 /*yield*/, waitFor(page, 2000, 30000)];
            case 20:
                _a.sent();
                return [4 /*yield*/, page.screenshot({
                        path: 'search-results.png',
                        fullPage: true
                    })];
            case 21:
                _a.sent();
                return [4 /*yield*/, page.$$('div.resultsDetails h3[itemprop="name"]')];
            case 22:
                listings = _a.sent();
                if (!(listings.length === 0)) return [3 /*break*/, 24];
                console.log('No listings found');
                return [4 /*yield*/, page.screenshot({ path: 'no-listings-found.png' })];
            case 23:
                _a.sent();
                return [3 /*break*/, 28];
            case 24:
                _i = 0, listings_1 = listings;
                _a.label = 25;
            case 25:
                if (!(_i < listings_1.length)) return [3 /*break*/, 28];
                listing = listings_1[_i];
                return [4 /*yield*/, page.evaluate(function (el) { return el.textContent; }, listing)];
            case 26:
                name_1 = _a.sent();
                console.log(name_1);
                _a.label = 27;
            case 27:
                _i++;
                return [3 /*break*/, 25];
            case 28: return [4 /*yield*/, screenrecorder.stop()];
            case 29:
                _a.sent();
                return [4 /*yield*/, page.close()];
            case 30:
                _a.sent();
                return [3 /*break*/, 34];
            case 31:
                error_1 = _a.sent();
                console.error("An error occurred: ", error_1);
                return [3 /*break*/, 34];
            case 32: return [4 /*yield*/, browser.close()];
            case 33:
                _a.sent();
                return [7 /*endfinally*/];
            case 34: return [2 /*return*/];
        }
    });
}); })();
