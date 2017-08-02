'use strict';
// CONFIGがなければ空のオブジェクト
if (!window.CONFIG) {
    window.CONFIG = {};
}

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
        .replace(/～〜/g, '~');
}

// バックチックと\をエスケープ
const escapeBackTick = function(str, nullSafe=true) {
    if (!str) {
        return nullSafe ? '' : str;
    }
    return str.toString().replace(/\\/g, '\\\\').replace(/`/g, '\\`');
}

// Markdwonのインライン記法をエスケープ
const escapeMarkdwon = function(str, nullSafe=true) {
    if (!str) {
        return nullSafe ? '' : str;
    }
    return escapeBackTick(str).replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/~/g, '\\~');
}

// 本体
$(function() {
    // 定数
    const commandMessage = 'bcdice';
    const appName = 'BCDiscord';
    const resultSpan = $('#result');
    const bcdiceApiUrlInput = $('#api_url');
    const botTokenInput = $('#token');
    const testStringInput = $('#test_string');
    const apiTestButton = $('#api_test');
    const connectButton = $('#connect_discord');
    
    // チャンネルごとの設定を保存
    let systemInfo = {};
    // ユーザ→配列インデックス
    let saveData = {};
    // ゲームリストの大文字小文字変換用
    let gameListLowerCaseTo = {};
    
    // ローカルストレージから復元
    if (CONFIG.api_url) {
        bcdiceApiUrlInput.val(CONFIG.api_url);
        if (CONFIG.lock_url_input) {
            bcdiceApiUrlInput.attr('readonly', true);
        };
    } else if (localStorage.getItem(`${appName}_api_url`)) {
        bcdiceApiUrlInput.val(localStorage.getItem(`${appName}_api_url`));
    }
    if (localStorage.getItem(`${appName}_token`)) {
        botTokenInput.val(localStorage.getItem(`${appName}_token`));
    }
    if (localStorage.getItem(`${appName}_systemInfo`)) {
        try {
            systemInfo = JSON.parse(localStorage.getItem(`${appName}_systemInfo`));
        } catch (e) {
            systemInfo = {};
        }
    }
    if (localStorage.getItem(`${appName}_saveData`)) {
        try {
            saveData = JSON.parse(localStorage.getItem(`${appName}_saveData`));
        } catch(e) {
            saveData = {};
        }
    }
    
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
        localStorage.setItem(`${appName}_api_url`, getBCDiceApiUrl());
    }
    
    // BCDice-APIのテスト
    apiTestButton.on('click', function() {
        const command = testStringInput.val();
        let apiUrl = getBCDiceApiUrl();
        if (!apiUrl || apiUrl == '') {
            alert('BCDice-APIのURLが必要です');
            bcdiceApiUrlInput.focus();
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
            dataType: 'jsonp'
        })
        .done(saveApiUrl)
        .done(doneCallback)
        .fail(function(jqXHR) { failNotice(`失敗しました(${jqXHR.status})`); });
    });
    
    // Discordへの接続
    let client = null;
    connectButton.on('click', function() {
        if (client) {
            if (!confirm('Discordから切断しますか？')) {
                return;
            }
            client.disconnect();
            return;
        }
        const token = botTokenInput.val();
        if (token && token != '') {
            connectButton.attr('disabled', true);
            client = new Discord.Client({
                token: token,
                autorun: true
            });
            const sendHowToUse = function(channelID) {
                client.sendMessage({
                    to: channelID,
                    message: "**How to use**\n# Show dice bot list\n> \`bcdice list\`\n# Change dice bot\n> \`bcdice set SYSTEM_NAME\`\n# Show Dice bot help\n> \`bcdice help SYSTEM_NAME\`\n# Show current Status\n> \`bcdice status\`\n# Reset Your Secret and Save data\n> \`bcdice reset me\`"
                });
            }
            
            client.on('ready', function() {
                connectButton.val('Discordから切断').attr('disabled', false);
                localStorage.setItem(`${appName}_token`, token);
                $.ajax({
                    type: 'GET',
                    url: getBCDiceApiUrl('/v1/systems'),
                    dataType: 'jsonp'
                })
                .done(saveApiUrl)
                .done(function(data) {
                    gameListLowerCaseTo = {};
                    for (let gameType of data.systems) {
                        gameListLowerCaseTo[gameType.toLowerCase()] = gameType;
                    }
                    doneNotice(`Discord Bot(${client.username})が接続しました、BCDice-APIのテストに成功しました`);
                })
                .fail(function() {
                    failNotice(`Discord Bot(${client.username})が接続しましたが、BCDice-APIのテストに失敗しました`);
                });
            });
            
            client.on('disconnect', function() {
                client = null;
                connectButton.val('Discordに接続').attr('disabled', false);
                failNotice(`Discord Botが切断されました`, true);
            });
            client.on('message', function(user, userID, channelID, message, event) {
                if (client.id === userID) {
                    return;
                }
                const commands = toCommandString(message.trim()).split(/\s+/);
                    //TODO タイピング表示について考え中
                    client.simulateTyping(channelID, function() {
                    if (commands[0].toLowerCase() === commandMessage) {
                        if (commands[1]) {
                            commands[1] = commands[1].toLowerCase();
                        }
                        switch (commands[1]) {
                        case 'list':
                            $.ajax({
                                type: 'GET',
                                url: getBCDiceApiUrl('/v1/systems'),
                                dataType: 'jsonp'
                            })
                            .done(saveApiUrl)
                            .done(function(data) {
                                gameListLowerCaseTo = {};
                                for (let gameType of data.systems) {
                                    gameListLowerCaseTo[gameType.toLowerCase()] = gameType;
                                }
                                client.sendMessage({
                                    to: channelID,
                                    message: `[DiceBot List]\n\`\`\`\n${escapeBackTick(data.systems.join("\n"))}\n\`\`\``
                                });
                            })
                            .fail(function() {
                                client.sendMessage({
                                    to: channelID,
                                    message: `**BCDice-API Connection Failed**`
                                });
                            });
                            break;
                        case 'set':
                            if (commands.length > 2) {
                                $.ajax({
                                    type: 'GET',
                                    url: getBCDiceApiUrl('/v1/systeminfo'),
                                    data: {system: gameListLowerCaseTo[commands[2].toLowerCase()] || commands[2]},
                                    dataType: 'jsonp'
                                })
                                .done(saveApiUrl)
                                .done(function(data) {
                                    systemInfo[channelID] = data.systeminfo;
                                    if (CONFIG.show_game_name && data.systeminfo) {
                                        client.setPresence({game: {name: data.systeminfo.name != 'DiceBot' ? data.systeminfo.name : null}});
                                    }
                                    client.sendMessage({
                                        to: channelID,
                                        message: `BCDice system is changed: ${escapeMarkdwon(data.systeminfo.gameType)}\n\`\`\`\n${escapeBackTick(data.systeminfo.info)}\n\`\`\``
                                    });
                                    localStorage.setItem(`${appName}_systemInfo`, JSON.stringify(systemInfo));
                                })
                                .fail(function() {
                                    //TODO 接続失敗を考慮
                                    client.sendMessage({
                                        to: channelID,
                                        message: `[${escapeMarkdwon(commands[2])}]\nSystem '${escapeMarkdwon(commands[2])}' is not found`
                                    });
                                });
                            } else {
                                client.sendMessage({
                                    to: channelID,
                                    message: `[ERROR] When you want to change dice system\n        *bcdice set SYSTEM_NAME*\nExample \`bcdice set AceKillerGene\``
                                });
                            }
                            break;
                        case 'reset':
                                if (commands[2] && commands[2].toLowerCase() === 'me') {
                                    delete saveData[userID];
                                    localStorage.setItem(`${appName}_saveData`, JSON.stringify(saveData));
                                    client.sendMessage({
                                        to: channelID,
                                        message: `[${escapeMarkdwon(appName)}]\n**Reset your Secret and Save data**`
                                    });
                                } else {
                                    client.sendMessage({
                                        to: channelID,
                                        message: `[${escapeMarkdwon(appName)}]\n# If you need **Reset your Secret and Save data,**\n> \`bcdice reset me\``
                                    });
                                }
                            break;
                        case 'load':
                            if ($.isNumeric(commands[2]) && saveData[userID] && saveData[userID][commands[2] - 1]) {
                                client.sendMessage({
                                    to: channelID,
                                    message: saveData[userID][commands[2] - 1]
                                });
                            } else {
                                client.sendMessage({
                                    to: channelID,
                                    message: `Not found (index = ${escapeMarkdwon(commands[2])})`
                                });
                            }
                            break;
                        case 'help':
                            if (commands.length > 2) {
                                $.ajax({
                                    type: 'GET',
                                    url: getBCDiceApiUrl('/v1/systeminfo'),
                                    data: {system: gameListLowerCaseTo[commands[2].toLowerCase()] || commands[2]},
                                    dataType: 'jsonp'
                                })
                                .done(saveApiUrl)
                                .done(function(data) {
                                    client.sendMessage({
                                        to: channelID,
                                        message: `[${escapeMarkdwon(data.systeminfo.gameType)}]\n\`\`\`\n${escapeBackTick(data.systeminfo.info)}\n\`\`\``
                                    });
                                })
                                .fail(function() {
                                    //TODO 接続失敗を考慮
                                    client.sendMessage({
                                        to: channelID,
                                        message: `[${escapeMarkdwon(commands[2])}]\nSystem '${escapeMarkdwon(commands[2])}' is not found`
                                    });
                                });
                            } else if (systemInfo[channelID]) {
                                client.sendMessage({
                                    to: channelID,
                                    message: `[${escapeMarkdwon(systemInfo[channelID].gameType)}]\n\`\`\`\n${escapeBackTick(systemInfo[channelID].info)}\n\`\`\``
                                });
                            } else {
                                sendHowToUse(channelID);
                            }
                            break;
                        case 'status':
                            $.ajax({
                                type: 'GET',
                                url: getBCDiceApiUrl('/v1/version'),
                                dataType: 'jsonp'
                            })
                            .done(saveApiUrl)
                            .done(function(data) {
                                client.sendMessage({
                                    to: channelID,
                                    message: `[${escapeMarkdwon(appName)}] for ${escapeMarkdwon(getBCDiceApiUrl())} : ${escapeMarkdwon(systemInfo[channelID] ? systemInfo[channelID].gameType : 'DiceBot')}(v.${escapeMarkdwon(data.bcdice)})`
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
                                    message: `To recall this,\n\`bcdice load ${length}\`\n${saveMessage}`
                                });
                                localStorage.setItem(`${appName}_saveData`, JSON.stringify(saveData));
                            } else {
                                client.sendMessage({
                                    to: userID,
                                    message: `[ERROR] When you want to save Message\n        *bcdice save SAVEING MESSAGE*\nExample \`bcdice save I love You.\``
                                });
                            }
                            break;
                        default:
                            sendHowToUse(channelID);
                            break;
                        }
                    } else {
                        //すべてBCDice-APIに投げずにchoice[]が含まれるか英数記号以外は門前払い
                        if (!(/choice\[.*\]/i.test(commands[0]) || /^[a-zA-Z0-9!-/:-@¥[-`{-~]+$/.test(commands[0]))) {
                            return;
                        }
                        const tmp = message.split(/[\s　]+/, 2);
                        let comment = message.substr(message.indexOf(tmp[0]) + tmp[0].length);
                        comment = tmp[1] ? comment.substr(comment.indexOf(tmp[1])) : '';
                        // 前処理、後処理に渡す情報
                        const infos = Object.assign({command: commands[0], raw_command: tmp[0], comment: comment}, systemInfo[channelID] || {});
                        if (infos.prefixs) {
                            infos.prefixs = [].concat(infos.prefixs); //変更防止
                        }
                        // 後方互換
                        const preProcess = CONFIG.pre_process || CONFIG.dice_command_post_process;
                        $.ajax({
                            type: 'GET',
                            url: getBCDiceApiUrl('/v1/diceroll'),
                            data: {
                                system: systemInfo[channelID] ? systemInfo[channelID].gameType : 'DiceBot',
                                command: preProcess ? preProcess(commands[0], infos) : commands[0]
                            },
                            dataType: 'jsonp'
                        })
                        .done(saveApiUrl)
                        .done(function(data) {
                            if (!data.ok) {
                                return;
                            }
                            if (CONFIG.show_game_name) {
                                if (systemInfo[channelID]) {
                                    client.setPresence({game: {name: systemInfo[channelID].name != 'DiceBot' ? systemInfo[channelID].name : null}});
                                } else {
                                    client.setPresence({game: {name: null}});
                                }
                            }
                            const responsMessage = `**>${escapeMarkdwon(user)}**\n${escapeMarkdwon(systemInfo[channelID] ? systemInfo[channelID].gameType : 'DiceBot')}${escapeMarkdwon(CONFIG.post_process ? CONFIG.post_process(data.result, Object.assign(infos, data)) : data.result)}`
                            if (data.secret) {
                                if (!saveData[userID]) {
                                    saveData[userID] = [];
                                }
                                const length = saveData[userID].push(responsMessage);
                                client.sendMessage({
                                    to: channelID,
                                    message: `**>${escapeMarkdwon(user)}**\n${escapeMarkdwon(systemInfo[channelID] ? systemInfo[channelID].gameType : 'DiceBot')}: [Secret Dice (Index = ${escapeMarkdwon(length)})]`
                                });
                                client.sendMessage({
                                    to: userID,
                                    message: `To recall this,\n\`bcdice load ${length}\`\n${responsMessage}`
                                });
                                localStorage.setItem(`${appName}_saveData`, JSON.stringify(saveData));
                            } else {
                                client.sendMessage({
                                    to: channelID,
                                    message: responsMessage
                                });
                            }
                        });
                    }
                });
            });
        } else {
            alert('Discord Botのtokenが必要です');
            botTokenInput.focus();
            return;
        }
    });
});