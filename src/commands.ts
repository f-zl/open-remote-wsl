import * as vscode from 'vscode';
import { getRemoteAuthority } from './authResolver';
import { WSLDistro, WSLManager, WSLOnlineDistro } from './wsl/wslManager';
import wslTerminal from './wsl/wslTerminal';

async function showDistrosPicker(wslManager: WSLManager, placeHolder: string): Promise<WSLDistro | undefined> {
    const pickItemsPromise = wslManager.listDistros()
        .then(distros => distros.map(distroData => {
            return {
                ...distroData,
                label: `${distroData.name}`,
                detail: distroData.isDefault ? 'default distro' : undefined,
            };
        }));

    const picked = await vscode.window.showQuickPick(pickItemsPromise, { canPickMany: false, placeHolder });
    return picked;
}

async function showOnlineDistrosPicker(wslManager: WSLManager, placeHolder: string): Promise<WSLOnlineDistro | undefined> {
    const pickItemsPromise = Promise.all([wslManager.listOnlineDistros(), wslManager.listDistros()])
        .then(([onlineDistros, localDistros]) => {
            const distroToInstall = onlineDistros.filter(d => !localDistros.some(l => l.name === d.name));
            return distroToInstall.map(distroData => {
                return {
                    ...distroData,
                    label: `${distroData.friendlyName}`,
                };
            });
        });

    const picked = await vscode.window.showQuickPick(pickItemsPromise, { canPickMany: false, placeHolder });
    return picked;
}

export async function promptOpenRemoteWSLWindow(wslManager: WSLManager, useDefault: boolean, reuseWindow: boolean) {
    let distroName: string | undefined;
    if (useDefault) {
        const distros = await wslManager.listDistros();
        distroName = distros.find(distro => distro.isDefault)?.name;
    } else {
        distroName = (await showDistrosPicker(wslManager, 'Select WSL distro'))?.name;
    }

    if (!distroName) {
        return;
    }

    openRemoteWSLWindow(distroName, reuseWindow);
}

export async function promptInstallNewWSLDistro(wslManager: WSLManager) {

    let distroName: string | undefined;
    distroName = (await showOnlineDistrosPicker(wslManager, 'Select the WSL distro to install'))?.name;

    if (!distroName) {
        return;
    }

    wslTerminal.runCommand(`wsl.exe --install -d ${distroName}`);
}

export function openRemoteWSLWindow(distro: string, reuseWindow: boolean) {
    vscode.commands.executeCommand('vscode.newWindow', { remoteAuthority: getRemoteAuthority(distro), reuseWindow });
}

export function openRemoteWSLLocationWindow(distro: string, path: string, reuseWindow: boolean, user?: string) {
    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.from({ scheme: 'vscode-remote', authority: getRemoteAuthority(distro, user), path }), { forceNewWindow: !reuseWindow });
}

export async function promptOpenDistroFolder(wslManager: WSLManager, reuseWindow: boolean, distroName?: string) {
    if (!distroName) {
        distroName = (await showDistrosPicker(wslManager, 'Select WSL distro'))?.name;
    }

    if (!distroName) {
        return;
    }

    const user = await vscode.window.showInputBox({
        prompt: `Username to use in the "${distroName}" distro (leave empty to use the default user)`,
        placeHolder: 'default user',
        validateInput: value => /[\s+]/.test(value) ? 'Username cannot contain whitespace or "+"' : undefined
    });
    if (user === undefined) {
        return;
    }

    const path = await vscode.window.showInputBox({
        prompt: `Folder or workspace file to open in the "${distroName}" distro`,
        placeHolder: '/home/user/project',
        validateInput: value => value.trim().length === 0 ? 'Path cannot be empty' : undefined
    });
    if (path === undefined) {
        return;
    }

    openRemoteWSLLocationWindow(distroName, path, reuseWindow, user || undefined);
}

export async function setDefaultWSLDistro(wslManager: WSLManager, distroName: string) {
    await wslManager.setDefaultDistro(distroName);
}

export async function deleteWSLDistro(wslManager: WSLManager, distroName: string) {
    const deleteAction = 'Delete';
    const resp = await vscode.window.showInformationMessage(`Are you sure you want to permanently delete the distro "${distroName}" including all its data?`, { modal: true }, deleteAction);
    if (resp === deleteAction) {
        await wslManager.deleteDistro(distroName);
        return true;
    }
    return false;
}
