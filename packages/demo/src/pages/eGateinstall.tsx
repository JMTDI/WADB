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

const variantPackageMap: Record<Variant, string> = {
    general: "com.oss.egate",
    "lg-classic": "com.android.cts.egate",
    external: "com.oss.accessibility",
};

// Direct APK URLs mapping
const apkUrls: Record<Variant, string> = {
    "general": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-general-release.apk",
    "lg-classic": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-lgclassic-release.apk",
    "external": "https://github.com/offlinesoftwaresolutions/eGate/releases/latest/download/app-external_accessibility-release.apk"
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

    // Fetch APK via proxy API with progress tracking
    private fetchApkWithProgress = async (variant: Variant): Promise<Blob> => {
        try {
            // First try the proxy API approach
            const proxyUrl = `/api/proxy?variant=${encodeURIComponent(variant)}`;
            
            const response = await fetch(proxyUrl, { 
                method: 'GET',
                headers: {
                    'Accept': 'application/vnd.android.package-archive, application/octet-stream, */*'
                }
            });
            
            if (!response.ok) {
                // If proxy fails, try direct GitHub download with no-cors mode
                return await this.fetchDirectWithFallback(variant);
            }

            const contentLength = response.headers.get('Content-Length');
            const total = contentLength ? parseInt(contentLength, 10) : 0;
            let loaded = 0;

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Response body is not readable');
            }

            const chunks: Uint8Array[] = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                chunks.push(value);
                loaded += value.length;

                if (total > 0) {
                    const progress = loaded / total;
                    runInAction(() => {
                        this.progress = {
                            filename: variantAssetMap[variant],
                            stage: Stage.Downloading,
                            value: progress * 0.8 // Reserve 20% for installation
                        };
                    });
                }
            }

            // Combine all chunks into a single Uint8Array
            const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const result = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                result.set(chunk, offset);
                offset += chunk.length;
            }

            return new Blob([result], { type: 'application/vnd.android.package-archive' });
        } catch (error: any) {
            // If proxy fails, try direct download as fallback
            return await this.fetchDirectWithFallback(variant);
        }
    };

    // Fallback method for direct download
    private fetchDirectWithFallback = async (variant: Variant): Promise<Blob> => {
        const apkUrl = apkUrls[variant];
        
        try {
            // Try with no-cors mode first
            const response = await fetch(apkUrl, { 
                mode: "no-cors",
                cache: "no-cache"
            });
            
            // With no-cors, we can't check response.ok, so we'll get the blob directly
            const blob = await response.blob();
            
            // If the blob is too small, it might be an error page
            if (blob.size < 1024 * 1024) { // Less than 1MB is suspicious for an APK
                throw new Error('Downloaded file is too small - may be an error page');
            }
            
            return blob;
        } catch (error: any) {
            // Final fallback - try CORS with different headers
            try {
                const response = await fetch(apkUrl, { 
                    mode: "cors",
                    headers: {
                        'Accept': '*/*',
                        'Origin': window.location.origin
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return await response.blob();
            } catch (corsError: any) {
                throw new Error(`All download methods failed. Last error: ${corsError.message}`);
            }
        }
    };

    install = async (variant: Variant) => {
        let blob: Blob;
        
        try {
            runInAction(() => {
                this.progress = { filename: variantAssetMap[variant], stage: Stage.Downloading, value: 0 };
                this.log = `Downloading "${variant}" variant from GitHub releases...\n`;
                this.installing = true;
            });

            blob = await this.fetchApkWithProgress(variant);
            
            runInAction(() => {
                this.log += `Download completed: ${(blob.size / 1024 / 1024).toFixed(2)} MB\n`;
            });

        } catch (error: any) {
            runInAction(() => {
                this.log += `Download error for variant "${variant}": ${error.message}\n`;
                this.installing = false;
            });
            return;
        }

        const fileName = variantAssetMap[variant];
        const file = new File([blob], fileName, {
            type: 'application/vnd.android.package-archive',
            lastModified: Date.now(),
        });

        runInAction(() => {
            this.progress = { filename: file.name, stage: Stage.Installing, value: 0.8 };
            this.log += `APK prepared for installation: ${file.name}\n`;
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
                                const percentage = 0.8 + (transferred / file.size) * 0.15; // 80% to 95%
                                this.progress = {
                                    filename: file.name,
                                    stage: transferred < file.size ? Stage.Installing : Stage.SettingPermissions,
                                    value: transferred < file.size ? percentage : 0.95,
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
                this.progress = { filename: file.name, stage: Stage.SettingPermissions, value: 0.95 };
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
