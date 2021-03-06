/*
This file is part of BCDiscord for Browser.

BCDiscord for Browser is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

BCDiscord for Browser is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Foobar.  If not, see <http://www.gnu.org/licenses/>.
*/
'use strict';
// CONFIGがなければ空のオブジェクト
if (!window.CONFIG) {
    window.CONFIG = {};
}
const CURRENT_CONFIG = Object.assign({
    theme: 'smoothness',
    use_local_storage: true,
    multiple_max: 10,
    command_string: 'bcdice',
    use_jsonp: false,
    result_at_mention: true
}, CONFIG);

// 定数
const appName = 'BCDiscord';
const appVersion = '0.9.7';

let jsonDataType = CURRENT_CONFIG.use_jsonp ? 'jsonp' : 'json';

// チャンネルごとの設定を保存
let systemInfo = {};
// ユーザ→配列インデックス
let saveData = {};
// ゲームリストの大文字小文字変換用
let gameListLowerCaseTo = {};

let resultSpan;
let bcdiceApiUrlInput;
let botTokenInput;
let testStringInput;
let apiTestButton;
let connectButton;

let alertMissingToken;
let alertMissingApiUrl;
let confirmDisconnect;

const limitedEval = math.eval;

math.import({
  'import': function () { throw new Error('Function import is disabled') },
  'createUnit': function () { throw new Error('Function createUnit is disabled') },
  'eval': function () { throw new Error('Function eval is disabled') },
  'parse': function () { throw new Error('Function parse is disabled') },
  'simplify': function () { throw new Error('Function simplify is disabled') },
  'derivative': function () { throw new Error('Function derivative is disabled') }
}, { override: true });

// 全角半角変換かつnull、undefinedを空文字に
const toCommandString = function(str, nullSafe=true) {
    if (!str) {
        return nullSafe ? '' : str;
    }
    return str.toString().replace(/[Ａ-Ｚａ-ｚ０-９！＂＃＄％＆＇（）＊＋，－．／：；＜＝＞？＠［＼］＾＿｀｛｜｝]/g, function(s) { return String.fromCharCode(s.charCodeAt(0) - 0xFEE0); })
        .replace(/[“”]/g, '"')
        .replace(/’/g, "'")
        .replace(/‘/g, '`')
        .replace(/￥/g, '\\')
        .replace(/　/g, ' ')
        .replace(/[‐－―]/g, '-')
        .replace(/、/g, ',')
        .replace(/。/g, '.')
        .replace(/[～〜]/g, '~');
}

// バックチックと\をエスケープ
const escapeBackTick = function(str, nullSafe=true) {
    if (!str) {
        return nullSafe ? '' : str;
    }
    return str.toString().replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

// Markdwonのインライン記法をエスケープ
const escapeMarkdwon = function(str, nullSafe=true, escapeSpoiler=true) {
    if (!str) {
        return nullSafe ? '' : str;
    }
    str = escapeBackTick(str).replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/~/g, '\\~');
    return escapeSpoiler ? str.replace(/\|/g, '\\|') : str;
}

// CONFIGを参照しユーザへの@mentionかユーザ名を切り替える
const userName = function(user, userID) {
    return CURRENT_CONFIG.result_at_mention ? `<@${userID}>` : escapeMarkdwon(user);
}

// 長いリストを複数回に分けて投稿
const sendList = async function(client, channelID, headline='', lines=[], maxlength=2000) {
    let tempLines = [];
    let length = headline.length;
    for (let i = 0; i < lines.length; i++) {
        tempLines.push(lines[i]);
        length += lines[i].length;
        if (i == (lines.length - 1) || (length + lines[i + 1].length + tempLines.length + 8) >= maxlength) {
            await (function() {
                return new Promise(resolve => client.sendMessage({
                    to: channelID,
                    message: headline + `\`\`\`\n${escapeBackTick(tempLines.join("\n"))}\n\`\`\``
                }, () => resolve(i)));
            })();
            tempLines = [];
            length = 0;
            headline = '';
        }
    }
}

// 本体
const main = function() {
    // 通知
    const notice = function(isFail=false, message='', doDesktopNotice=false) {
        if (isFail) {
            resultSpan.addClass('fail').text(message);
        } else {
            resultSpan.removeClass('fail').text(message);
        }
        // TODO デスクトップ通知
    }
    const doneNotice = function(message, doDesktopNotice=false) {
        notice(false, message, doDesktopNotice);
    }
    const failNotice = function(message, doDesktopNotice=false) {
        notice(true, message, doDesktopNotice);
    }
    
    // BCDice-API URLの取得
    const getBCDiceApiUrl = function(joinUrl) {
        let apiUrl = bcdiceApiUrlInput.val();
        if (apiUrl && apiUrl != '') {
            apiUrl = apiUrl.trim();
            if (joinUrl && apiUrl.substr(apiUrl.length - 1) === '/') {
                apiUrl = apiUrl.substr(0, apiUrl.length - 1) + joinUrl;
            } else if (joinUrl) {
                apiUrl += joinUrl;
            }
        }
        return apiUrl;
    }
    
    // BCDice-API URLのローカル保存
    const saveApiUrl = function() {
        if (CURRENT_CONFIG.use_local_storage) {
            localStorage.setItem(`${appName}_api_url`, getBCDiceApiUrl());
        }
    }
    
    // BCDice-APIのテスト
    apiTestButton.on('click', () => {
        const command = testStringInput.val();
        let apiUrl = getBCDiceApiUrl();
        if (!apiUrl || apiUrl == '') {
            alertMissingApiUrl();
            return;
        }
        let data = {};
        let doneCallback;
        if (command && command.trim() != '') {
            apiUrl = getBCDiceApiUrl('/v1/diceroll');
            data = {system: 'DiceBot', command: toCommandString(command).trim()};
            doneCallback = function(data) { doneNotice(`result${data.result}`); };
        } else {
            apiUrl = getBCDiceApiUrl('/v1/version');
            doneCallback = function(data) { doneNotice(`api:${data.api} bcdice:${data.bcdice}`); }
        }
        $.ajax({
            type: 'GET',
            url: apiUrl,
            data: data,
            dataType: jsonDataType
        })
        .done(saveApiUrl)
        .done(doneCallback)
        .fail(function(jqXHR) { failNotice(`失敗しました(${jqXHR.status})`); });
    });
    
    // Discordへの接続
    let client = null;
    connectButton.on('click', () => {
        if (client && client.connected) {
            confirmDisconnect(client);
            return;
        }
        const token = botTokenInput.val();
        if (token && token != '') {
            connectButton.val('接続中...').button("disable");
            client = new Discord.Client({
                token: token,
                autorun: true
            });
            const sendHowToUse = (channelID) => {
                client.sendMessage({
                    to: channelID,
                    message: `[${appName}] **使い方**\n# 利用可能なダイスボット名（システムID）の一覧\n> \`${CURRENT_CONFIG.command_string} list\`\n# 使用可能なゲーム名 → ダイスボット名（システムID）一覧（API Ver. 0.6以上）\n> \`${CURRENT_CONFIG.command_string} names\`\n# 使用するダイスボットの設定、変更\n> \`${CURRENT_CONFIG.command_string} set [ダイスボット名（システムID）]\`\n# ダイスボットのヘルプを表示\n> \`${CURRENT_CONFIG.command_string} help [ダイスボット名（システムID）]\`\n# 現在の状態（APIのURL、設定されたダイスボットとバージョン）\n> \`${CURRENT_CONFIG.command_string} status\`\n# あなたのセーブされたシークレットダイスとメッセージをリセット\n> \`${CURRENT_CONFIG.command_string} reset me\``
                });
            };
            
            client.on('ready', () => {
                connectButton.val('Discordから切断').button("enable");
                if (CURRENT_CONFIG.use_local_storage) {
                    localStorage.setItem(`${appName}_token`, token);
                }
                $.ajax({
                    type: 'GET',
                    url: getBCDiceApiUrl('/v1/systems'),
                    dataType: jsonDataType
                })
                .done(saveApiUrl)
                .done((data) => {
                    for (let gameType of data.systems) {
                        gameListLowerCaseTo[gameType.toLowerCase()] = gameType;
                        gameListLowerCaseTo[gameType.replace(/\s+/g, '').toLowerCase()] = gameType;
                        gameListLowerCaseTo[gameType.replace(/\s+/g, '').replace(/\&/g, 'And').toLowerCase()] = gameType;
                    }
                    doneNotice(`Discord Bot(${client.username})が接続しました、BCDice-APIのテストに成功しました`);
                })
                .fail(() => {
                    failNotice(`Discord Bot(${client.username})が接続しましたが、BCDice-APIのテストに失敗しました`);
                });
            });
            
            client.on('disconnect', (errMsg, code) => {
                client = null;
                failNotice(`Discord Botが切断されました: ${code}`, true);
                connectButton.val('Discordに接続').button("enable");
            });
            
            client.on('message', (user, userID, channelID, message, event) => {
                if (client.id === userID) {
                    return;
                }
                const commands = toCommandString(message.trim()).split(/\s+/);
                if (commands[0].toLowerCase() === CURRENT_CONFIG.command_string.toLowerCase()) {
                    client.simulateTyping(channelID, () => {
                        if (commands[1]) {
                            commands[1] = commands[1].toLowerCase();
                        }
                        switch (commands[1]) {
                        case 'list':
                            $.ajax({
                                type: 'GET',
                                url: getBCDiceApiUrl('/v1/systems'),
                                dataType: jsonDataType
                            })
                            .done(saveApiUrl)
                            .done((data) => {
                                sendList(
                                    client,
                                    channelID,
                                    `[${appName}] 使用可能なダイスボット名（システムID）一覧\n`,
                                    data.systems.map(gameType => {
                                        gameListLowerCaseTo[gameType.toLowerCase()] = gameType;
                                        gameListLowerCaseTo[gameType.replace(/\s+/g, '').toLowerCase()] = gameType;
                                        gameListLowerCaseTo[gameType.replace(/\s+/g, '').replace(/\&/g, 'And').toLowerCase()] = gameType;
                                        return gameType;
                                    })
                                );
                            })
                            .fail(() => {
                                client.sendMessage({
                                    to: channelID,
                                    message: `[${appName}]\n**BCDice-API Connection Failed**`
                                });
                            });
                            break;
                        case 'names':
                            $.ajax({
                                type: 'GET',
                                url: getBCDiceApiUrl('/v1/names'),
                                dataType: jsonDataType
                            })
                            .done(saveApiUrl)
                            .done((data) => {
                                sendList(
                                    client,
                                    channelID,
                                    `[${appName}] 使用可能なゲーム名 → ダイスボット名（システムID）一覧\n`,
                                    data.names.sort((v1, v2) => { if (v1.name == v2.name) return 0; return (v1.name < v2.name) ? -1 : 1 }).map(gameNames => {
                                        gameListLowerCaseTo[gameNames.system.toLowerCase()] = gameNames.system;
                                        gameListLowerCaseTo[gameNames.system.replace(/\s+/g, '').toLowerCase()] = gameNames.system;
                                        gameListLowerCaseTo[gameNames.system.replace(/\s+/g, '').replace(/\&/g, 'And').toLowerCase()] = gameNames.system;
                                        gameListLowerCaseTo[gameNames.name.replace(/[\s]+/g, '').toLowerCase()] = gameNames.system;
                                        gameListLowerCaseTo[toCommandString(gameNames.name).replace(/[\s・]+/g, '').toLowerCase()] = gameNames.system;
                                        gameListLowerCaseTo[toCommandString(gameNames.name).replace(/[\s・]+/g, '').replace(/[\&＆]/g, 'アンド').toLowerCase()] = gameNames.system;
                                        return `${gameNames.name} → ${gameNames.system}`;
                                    })
                                );
                            })
                            .fail(() => {
                                client.sendMessage({
                                    to: channelID,
                                    message: `[${appName}]\n**BCDice-API Connection Failed**`
                                });
                            });
                            break;
                        case 'set':
                            if (commands.length > 2) {
                                $.ajax({
                                    type: 'GET',
                                    url: getBCDiceApiUrl('/v1/systeminfo'),
                                    data: {system: gameListLowerCaseTo[commands.slice(2).join('').replace(/[\s・]+/g, '').toLowerCase()] || commands.slice(2).join(' ')},
                                    dataType: jsonDataType
                                })
                                .done(saveApiUrl)
                                .done((data) => {
                                    systemInfo[channelID] = data.systeminfo;
                                    if (CURRENT_CONFIG.show_game_name && data.systeminfo) {
                                        client.setPresence({game: {name: data.systeminfo.name != 'DiceBot' ? data.systeminfo.name : null}});
                                    }
                                    client.sendMessage({
                                        to: channelID,
                                        message: `[${appName}] ダイスボットを${escapeMarkdwon(data.systeminfo.name)}に設定しました。\n\`\`\`\n${escapeBackTick(data.systeminfo.info)}\n\`\`\``
                                    });
                                    if (CURRENT_CONFIG.use_local_storage) {
                                        localStorage.setItem(`${appName}_systemInfo`, JSON.stringify(systemInfo));
                                    }
                                })
                                .fail(function() {
                                    //TODO 接続失敗を考慮
                                    client.sendMessage({
                                        to: channelID,
                                        message: `[${appName}] ダイスボット「${escapeMarkdwon(commands.slice(2).join(' '))}」が見つかりません。`
                                    });
                                });
                            } else {
                                client.sendMessage({
                                    to: channelID,
                                    message: `[${appName}] ダイスボットを設定、変更したい場合、\`${CURRENT_CONFIG.command_string} set [ダイスボット名（システムID）]\`*\n例：\`${CURRENT_CONFIG.command_string} set AceKillerGene\``
                                });
                            }
                            break;
                        case 'reset':
                                if (commands[2] && commands[2].toLowerCase() === 'me') {
                                    delete saveData[userID];
                                    if (CURRENT_CONFIG.use_local_storage) {
                                        localStorage.setItem(`${appName}_saveData`, JSON.stringify(saveData));
                                    }
                                    client.sendMessage({
                                        to: channelID,
                                        message: `**>${userName(user, userID)}**\nあなたのシークレットダイスとセーブしたメッセージをリセットしました。`
                                    });
                                } else {
                                    client.sendMessage({
                                        to: channelID,
                                        message: `[${appName}]\n# あなたのシークレットダイスとセーブしたメッセージをリセットしたい場合、\n> \`${CURRENT_CONFIG.command_string} reset me\``
                                    });
                                }
                            break;
                        case 'load':
                            let loadedMessage;
                            if (commands.length >= 3) {
                                const loadData = [];
                                for (let i = 2; i < commands.length; i++) {
                                    if ($.isNumeric(commands[i]) && saveData[userID] && saveData[userID][commands[i] - 1]) {
                                        loadData.push(saveData[userID][commands[i] - 1]);
                                    } else {
                                        loadData.push(`*シークレットダイス、セーブされたメッセージが見つかりません (index = ${escapeMarkdwon(commands[i])})*`);
                                    }
                                }
                                loadedMessage = loadData.join("\n");
                            } else {
                                loadedMessage = `[${appName}]\n# あなたのシークレットダイスやセーブしたメッセージをロードしたい場合、\n> \`${CURRENT_CONFIG.command_string} load [Index] [Indexはスペース区切りで複数記述できます]\``
                            }
                            client.sendMessage({
                                to: channelID,
                                message: `**>${userName(user, userID)}**\n${loadedMessage}`
                            });
                            break;
                        case 'help':
                            if (commands.length > 2) {
                                $.ajax({
                                    type: 'GET',
                                    url: getBCDiceApiUrl('/v1/systeminfo'),
                                    data: {system: gameListLowerCaseTo[commands.slice(2).join('').replace(/[\s・]+/g, '').toLowerCase()] || commands.slice(2).join(' ')},
                                    dataType: jsonDataType
                                })
                                .done(saveApiUrl)
                                .done((data) => {
                                    client.sendMessage({
                                        to: channelID,
                                        message: `[${escapeMarkdwon(data.systeminfo.name)}]\n\`\`\`\n${escapeBackTick(data.systeminfo.info)}\n\`\`\``
                                    });
                                })
                                .fail(() => {
                                    //TODO 接続失敗を考慮
                                    client.sendMessage({
                                        to: channelID,
                                        message: `[${appName}]\ダイスボット「${escapeMarkdwon(commands.slice(2).join(' '))}」が見つかりません。`
                                    });
                                });
                            } else if (systemInfo[channelID]) {
                                client.sendMessage({
                                    to: channelID,
                                    message: `[${escapeMarkdwon(systemInfo[channelID].name)}]\n\`\`\`\n${escapeBackTick(systemInfo[channelID].info)}\n\`\`\``
                                });
                            } else {
                                sendHowToUse(channelID);
                            }
                            break;
                        case 'status':
                            $.ajax({
                                type: 'GET',
                                url: getBCDiceApiUrl('/v1/version'),
                                dataType: jsonDataType
                            })
                            .done(saveApiUrl)
                            .done((data) => {
                                client.sendMessage({
                                    to: channelID,
                                    message: `[${appName}] for ${escapeMarkdwon(getBCDiceApiUrl())} : ${escapeMarkdwon(systemInfo[channelID] ? systemInfo[channelID].gameType : 'DiceBot')}(v.${escapeMarkdwon(data.bcdice)})`
                                });
                            });
                            break;
                        case 'save':
                            const tmp = message.split(/[\s　]+/, 3);
                            if (tmp[2]) {
                                let saveMessage = message.substr(message.indexOf(tmp[0]) + tmp[0].length);
                                saveMessage = saveMessage.substr(saveMessage.indexOf(tmp[1]) + tmp[1].length);
                                saveMessage = saveMessage.substr(saveMessage.indexOf(tmp[2]));
                                if (!saveData[userID]) {
                                    saveData[userID] = [];
                                }
                                const length = saveData[userID].push(saveMessage);
                                client.sendMessage({
                                    to: userID,
                                    message: `以下のメッセージを呼び出したい場合 > \`${CURRENT_CONFIG.command_string} load ${length}\`\n${saveMessage}`
                                });
                                if (CURRENT_CONFIG.use_local_storage) {
                                    localStorage.setItem(`${appName}_saveData`, JSON.stringify(saveData));
                                }
                            } else {
                                client.sendMessage({
                                    to: userID,
                                    message: `[${appName}] メッセージをセーブしたい場合、\n\`${CURRENT_CONFIG.command_string} save [SAVEING MESSAGE]*\`\n例：\`${CURRENT_CONFIG.command_string} save I love You.\``
                                });
                            }
                            break;
                        default:
                            sendHowToUse(channelID);
                            break;
                        }
                    });
                } else {
                    // C(計算式)
                    let expr = commands[0].match(/^C\(([\d\.\+\-\*\/\(\)]+)\)$/i);
                    if (expr) {
                        client.sendMessage({
                            to: channelID,
                            message: `[${appName}] ${escapeMarkdwon(expr[1])} = ${escapeMarkdwon(limitedEval(expr[1]))}`
                        });
                        return;
                    }
                    // 複数回か？
                    let count = 1;
                    let isMultiple = false;
                    if ($.isNumeric(commands[0])) {
                        // コマンドの先頭を取り除く
                        count = parseInt(commands.shift(), 10);
                        isMultiple = true;
                    }
                    // すべてBCDice-APIに投げずに回数が1回未満かchoice[]が含まれるか英数記号以外は門前払い
                    if (!commands[0] || count < 1 || !(/choice\[.*\]/i.test(commands[0]) || /^[a-zA-Z0-9!-/:-@¥[-`{-~\}]+$/.test(commands[0]))) {
                        return;
                    }
                    client.simulateTyping(channelID, () => {
                        // 回数が最大を超える
                        if (CURRENT_CONFIG.multiple_max != null) {
                            if (!CURRENT_CONFIG.multiple_max || CURRENT_CONFIG.multiple_max + 0 === 0) {
                                client.sendMessage({
                                    to: channelID,
                                    message: `[${appName}] 複数回ロールは無効です`
                                });
                                return;
                            }
                            if (CURRENT_CONFIG.multiple_max && count > CURRENT_CONFIG.multiple_max + 0) {
                                client.sendMessage({
                                    to: channelID,
                                    message: `[${appName}] 複数回ロールの回数が多すぎます (最大${CURRENT_CONFIG.multiple_max}回)`
                                });
                                return;
                            }
                        }
                        let rawCommand = '';
                        let comment = '';
                        if (isMultiple) {
                            const tmp = message.split(/[\s　]+/, 3);
                            comment = message.substr(message.indexOf(tmp[0]) + tmp[0].length);
                            comment = comment.substr(message.indexOf(tmp[1]) + tmp[1].length);
                            comment = tmp[2] ? comment.substr(comment.indexOf(tmp[2])) : '';
                            rawCommand = tmp[1];
                        } else {
                            const tmp = message.split(/[\s　]+/, 2);
                            comment = message.substr(message.indexOf(tmp[0]) + tmp[0].length);
                            comment = tmp[1] ? comment.substr(comment.indexOf(tmp[1])) : '';
                            rawCommand = tmp[0];
                        }
                        // 前処理、後処理に渡す情報
                        const infos = Object.assign({command: commands[0], raw_command: rawCommand, comment: comment, is_multiple: isMultiple, max_index: count}, systemInfo[channelID] || {});
                        if (infos.prefixs) {
                            infos.prefixs = [].concat(infos.prefixs); //変更防止
                        }
                        // 後方互換
                        const preProcess = CURRENT_CONFIG.pre_process || CURRENT_CONFIG.dice_command_post_process;
                        // API接続
                        const rolls = [];
                        for (let i = 0; i < count; i++) {
                            rolls.push($.ajax({
                                type: 'GET',
                                url: getBCDiceApiUrl('/v1/diceroll'),
                                data: {
                                    system: systemInfo[channelID] ? systemInfo[channelID].gameType : 'DiceBot',
                                    command: preProcess ? preProcess(commands[0], Object.assign({index: i + 1}, infos)) : commands[0]
                                },
                                dataType: jsonDataType
                            }));
                        }
                        $.when(...rolls)
                        .done(saveApiUrl)
                        .done(function() {
                            if (CURRENT_CONFIG.show_game_name) {
                                if (systemInfo[channelID]) {
                                    client.setPresence({game: {name: systemInfo[channelID].name != 'DiceBot' ? systemInfo[channelID].name : null}});
                                } else {
                                    client.setPresence({game: {name: null}});
                                }
                            }
                            const responsMessages = [];
                            const secretResponsMessages = [];
                            const indexes = [];
                            for (let i = 0; i < arguments.length; i++) {
                                let data = count > 1 ? arguments[i][0] : arguments[0];
                                if (data.ok) {
                                    const responsMessage = `${isMultiple ? '#' + (i + 1) + ' ' : ''}${escapeMarkdwon(systemInfo[channelID] ? systemInfo[channelID].gameType : 'DiceBot')}${escapeMarkdwon(CURRENT_CONFIG.post_process ? CURRENT_CONFIG.post_process(data.result, Object.assign({index: i + 1}, infos, data)) : data.result)}`;
                                    if (data.secret) {
                                        if (!saveData[userID]) {
                                            saveData[userID] = [];
                                        }
                                        const saveIndex = saveData[userID].push(responsMessage);
                                        indexes.push(saveIndex);
                                        responsMessages.push(`${isMultiple ? '#' + (i + 1) + ' ' : ''}${escapeMarkdwon(systemInfo[channelID] ? systemInfo[channelID].gameType : 'DiceBot')}: [Secret Dice (Index = ${saveIndex})]`);
                                        secretResponsMessages.push(responsMessage);
                                    } else {
                                        responsMessages.push(responsMessage);
                                    }
                                }
                                if (count === 1) {
                                    break;
                                }
                            }
                            if (secretResponsMessages.length > 0) {
                                const userMessages = indexes.map((e, i) => `\`${CURRENT_CONFIG.command_string} load ${e}\` > ${secretResponsMessages[i]}`);
                                client.sendMessage({
                                    to: userID,
                                    message: `シークレットダイスの結果を呼び出したい場合\n${userMessages.join("\n")}`
                                });
                                if (CURRENT_CONFIG.use_local_storage) {
                                    localStorage.setItem(`${appName}_saveData`, JSON.stringify(saveData));
                                }
                            } 
                            if (responsMessages.length > 0) {
                                client.sendMessage({
                                    to: channelID,
                                    message: `**>${userName(user, userID)}**\n${responsMessages.join("\n")}`
                                });
                            }
                        });
                    });
                }
            });
        } else {
            alertMissingToken();
            return;
        }
    });
}
