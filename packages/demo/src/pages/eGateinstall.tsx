import React from "react";
import { PrimaryButton, Stack, ProgressIndicator } from "@fluentui/react";
import { PackageManager } from "@yume-chan/android-bin";
import { WrapConsumableStream } from "@yume-chan/stream-extra";
import { action, makeAutoObservable, observable, runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { NextPage } from "next";
import Head from "next/head";
import { GLOBAL_STATE } from "../state";
import { ProgressStream, RouteStackProps, createFileStream } from "../utils";

enum Stage {
    Downloading,
    Installing,
    SettingPermissions,
    Completed,
}

interface Progress {
    filename: string;
    stage: Stage;
    value: number | undefined;
}

type Variant = "general" | "lg-classic" | "external";

const variantAssetMap: Record<Variant, string> = {
    general: "app-general-release.apk",
    "lg-classic": "app-lgclassic-release.apk",
    external: "app-external_accessibility-release.apk",
};

const variantUrlMap: Record<Variant, string> = {
    general: "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk",
    "lg-classic": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-lgclassic-release.apk",
    external: "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-external_accessibility-release.apk",
};

const variantPackageMap: Record<Variant, string> = {
    general: "com.oss.egate",
    "lg-classic": "com.android.cts.egate",
    external: "com.oss.accessibility",
};

class InstallPageState {
    installing = false;
    progress: Progress | undefined = undefined;
    log: string = "";
    options: Record<string, any> = {};

    constructor() {
        makeAutoObservable(this, {
            progress: observable.ref,
        });
    }

    // More robust CORS bypass with multiple working proxies
    private fetchWithCorsProxy = async (url: string): Promise<Response> => {
        const proxies = [
            // Proxy 1: AllOrigins (most reliable)
            async (targetUrl: string) => {
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`AllOrigins proxy failed: ${response.status}`);
                return response;
            },
            
            // Proxy 2: Cors.sh
            async (targetUrl: string) => {
                const proxyUrl = `https://cors.sh/${targetUrl}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`Cors.sh proxy failed: ${response.status}`);
                return response;
            },
            
            // Proxy 3: Proxy-cors
            async (targetUrl: string) => {
                const proxyUrl = `https://proxy-cors.vercel.app/api/proxy?url=${encodeURIComponent(targetUrl)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`Proxy-cors failed: ${response.status}`);
                return response;
            },
            
            // Proxy 4: No-cors mode (fallback)
            async (targetUrl: string) => {
                const response = await fetch(targetUrl, {
                    method: 'GET',
                    mode: 'no-cors',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    },
                });
                return response;
            },
            
            // Proxy 5: Direct fetch (last resort)
            async (targetUrl: string) => {
                const response = await fetch(targetUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/vnd.android.package-archive,*/*',
                        'Cache-Control': 'no-cache',
                    },
                });
                return response;
            }
        ];

        let lastError: Error | null = null;
        
        for (let i = 0; i < proxies.length; i++) {
            try {
                runInAction(() => {
                    this.log += `Trying proxy method ${i + 1}...\n`;
                });
                
                const response = await proxies[i](url);
                
                if (response.ok || response.type === 'opaque') {
                    runInAction(() => {
                        this.log += `Proxy method ${i + 1} succeeded!\n`;
                    });
                    return response;
                }
                
                throw new Error(`Response not ok: ${response.status}`);
            } catch (error: any) {
                lastError = error;
                runInAction(() => {
                    this.log += `Proxy method ${i + 1} failed: ${error.message}\n`;
                });
                continue;
            }
        }
        
        throw new Error(`All proxy methods failed. Last error: ${lastError?.message}`);
    };

    runCommand = async (cmd: string): Promise<string> => {
        if (
            !GLOBAL_STATE.adb ||
            !GLOBAL_STATE.adb.subprocess ||
            typeof GLOBAL_STATE.adb.subprocess.shell !== "function"
        ) {
            throw new Error("ADB subprocess.shell not available.");
        }
        try {
            const process = await GLOBAL_STATE.adb.subprocess.shell(cmd);
            const decoder = new TextDecoder();
            let accumulatedOutput = "";
            const reader = process.stdout.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    accumulatedOutput += decoder.decode(value, { stream: true });
                }
            } finally {
                reader.releaseLock();
            }
            if (process.stderr) {
                const errorReader = process.stderr.getReader();
                try {
                    while (true) {
                        const { done, value } = await errorReader.read();
                        if (done) break;
                        accumulatedOutput += decoder.decode(value, { stream: true });
                    }
                } finally {
                    errorReader.releaseLock();
                }
            }
            return accumulatedOutput.trim();
        } catch (error: any) {
            throw new Error(`Command execution failed: ${error.message}`);
        }
    };

    install = async (variant: Variant) => {
        const apkUrl = variantUrlMap[variant];
        let blob: Blob;
        try {
            runInAction(() => {
                this.progress = { filename: variantAssetMap[variant], stage: Stage.Downloading, value: 0 };
                this.log = `Starting download of "${variant}" variant from GitHub...\n`;
                this.log += `Target URL: ${apkUrl}\n`;
                this.installing = true;
            });
            
            // Use the robust CORS proxy with multiple fallbacks
            const response = await this.fetchWithCorsProxy(apkUrl);
            
            // Handle opaque responses (from no-cors mode)
            if (response.type === 'opaque') {
                runInAction(() => {
                    this.log += `Received opaque response (no-cors mode). Attempting to process...\n`;
                });
                blob = await response.blob();
            } else {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const contentLength = response.headers.get('content-length');
                if (contentLength) {
                    runInAction(() => {
                        this.log += `Content length: ${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB\n`;
                    });
                }
                
                blob = await response.blob();
            }
            
            if (!blob || blob.size === 0) {
                throw new Error('Downloaded file is empty or invalid');
            }
            
            runInAction(() => {
                this.log += `Download completed! File size: ${(blob.size / 1024 / 1024).toFixed(2)} MB\n`;
            });
            
        } catch (error: any) {
            runInAction(() => {
                this.log += `Download error for variant "${variant}": ${error.message}\n`;
                this.log += `This might be due to CORS restrictions or network issues.\n`;
                this.installing = false;
            });
            return;
        }
        const fileName = variantAssetMap[variant];
        const file = new File([blob], fileName, {
            type: blob.type,
            lastModified: Date.now(),
        });
        runInAction(() => {
            this.progress = { filename: file.name, stage: Stage.Installing, value: 0.1 };
            this.log += `APK downloaded: ${file.name}\n`;
        });
        if (!GLOBAL_STATE.adb) {
            runInAction(() => {
                this.log += "ADB connection not established via GLOBAL_STATE.adb.\n";
                this.installing = false;
            });
            return;
        }
        const pm = new PackageManager(GLOBAL_STATE.adb);
        const start = Date.now();
        try {
            const installLogOutput = await pm.installStream(
                file.size,
                createFileStream(file)
                    .pipeThrough(new WrapConsumableStream())
                    .pipeThrough(
                        new ProgressStream(
                            action((transferred: number) => {
                                const percentage = transferred / file.size;
                                this.progress = {
                                    filename: file.name,
                                    stage: transferred < file.size ? Stage.Installing : Stage.SettingPermissions,
                                    value: transferred < file.size ? percentage : 0.8,
                                };
                            })
                        )
                    ),
                { ...this.options, grantRuntimePermissions: true } as any
            );
            runInAction(() => {
                this.log += `Installation output: ${installLogOutput}\n`;
            });
        } catch (error: any) {
            runInAction(() => {
                this.log += `Error during APK install: ${error.message}\n`;
                this.installing = false;
            });
            return;
        }
        const pkg = variantPackageMap[variant];
        try {
            runInAction(() => {
                this.log += `Setting up package: ${pkg}\n`;
                this.progress = { filename: file.name, stage: Stage.SettingPermissions, value: 0.9 };
            });
            if (variant === "lg-classic") {
                try {
                    const uninstallOutput = await this.runCommand("pm uninstall -k --user 0 com.qualcomm.simcontacts");
                    runInAction(() => {
                        this.log += `Uninstall simcontacts output: ${uninstallOutput || 'Command completed'}\n`;
                    });
                } catch (error: any) {
                    runInAction(() => {
                        this.log += `Uninstall simcontacts failed: ${error.message}\n`;
                    });
                }
                try {
                    const dpmOutput = await this.runCommand("dpm set-device-owner com.android.cts.egate/.a");
                    runInAction(() => {
                        this.log += `Device owner set (lg-classic): ${dpmOutput || 'Command completed'}\n`;
                    });
                } catch (error: any) {
                    runInAction(() => {
                        this.log += `Device owner setup failed: ${error.message}\n`;
                    });
                }
            } else if (variant === "general") {
                try {
                    const dpmOutput = await this.runCommand(`dpm set-device-owner ${pkg}/.a`);
                    runInAction(() => {
                        this.log += `Device owner set: ${dpmOutput || 'Command completed'}\n`;
                    });
                } catch (error: any) {
                    runInAction(() => {
                        this.log += `Device owner setup failed: ${error.message}\n`;
                    });
                }
            } else if (variant === "external") {
                runInAction(() => {
                    this.log += `Skipping device owner setup for external accessibility variant.\n`;
                });
            }
            runInAction(() => {
                this.progress = { filename: file.name, stage: Stage.Completed, value: 1 };
            });
        } catch (error: any) {
            runInAction(() => {
                this.log += `Error during package setup: ${error.message}\n`;
                this.progress = { filename: file.name, stage: Stage.Completed, value: 1 };
            });
        }
        const elapsed = Date.now() - start;
        const transferRate = (file.size / (elapsed / 1000) / 1024 / 1024).toFixed(2);
        runInAction(() => {
            this.log += `\nInstall process completed in ${elapsed} ms at ${transferRate} MB/s\n`;
            this.installing = false;
        });
    };
}

const state = new InstallPageState();

const InstallEgate: NextPage = () => {
    const isDeviceConnected = Boolean(GLOBAL_STATE.adb);
    const areButtonsDisabled = !isDeviceConnected || state.installing;

    return (
        <Stack {...RouteStackProps} tokens={{ childrenGap: 20 }}>
            <Head>
                <title>eGate auto-installer - WADB</title>
            </Head>
            <Stack horizontal tokens={{ childrenGap: 15 }}>
                <PrimaryButton 
                    disabled={areButtonsDisabled} 
                    text="General" 
                    onClick={() => state.install("general")} 
                />
                <PrimaryButton 
                    disabled={areButtonsDisabled} 
                    text="LG Classic" 
                    onClick={() => state.install("lg-classic")} 
                />
                <PrimaryButton 
                    disabled={areButtonsDisabled} 
                    text="External Accessibility" 
                    onClick={() => state.install("external")} 
                />
            </Stack>
            {state.progress && (
                <ProgressIndicator
                    styles={{ root: { width: 300, marginTop: 20 } }}
                    label={state.progress.filename}
                    percentComplete={state.progress.value}
                    description={Stage[state.progress.stage]}
                />
            )}
            {state.log && (
                <pre style={{ marginTop: 20, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                    {state.log}
                </pre>
            )}
        </Stack>
    );
};

export default observer(InstallEgate);
