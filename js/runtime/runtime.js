var now = new Date();

function createtime() {
    // 设置起始时间
    var startTime = new Date("01/27/2025 00:00:00");
    now.setTime(now.getTime() + 250);

    // 计算运行时间
    var days = Math.floor((now - startTime) / 1e3 / 60 / 60 / 24); // 运行天数
    var hours = Math.floor(((now - startTime) / 1e3 / 60 / 60) % 24); // 运行小时数
    var minutes = Math.floor(((now - startTime) / 1e3 / 60) % 60); // 运行分钟数
    var seconds = Math.round(((now - startTime) / 1e3) % 60); // 运行秒数

    // 格式化为两位数
    hours = hours < 10 ? "0" + hours : hours;
    minutes = minutes < 10 ? "0" + minutes : minutes;
    seconds = seconds < 10 ? "0" + seconds : seconds;

    // 根据时间段设置显示内容
    let displayContent = "";
    if (hours >= 9 && hours < 18) {
        displayContent = `
            <img class='boardsign' src='https://204180371.xyz/PicGo/PixPin_2025-01-28_12-33-09.png' title='加油喵！'>
            <span class='textTip'>
                <br> 本站居然运行了 ${days} 天
            </span>
            <span id='runtime'> ${hours} 小时 ${minutes} 分 ${seconds} 秒 </span>
            <i class='fas fa-heartbeat' style='color:red'></i>
        `;
    } else {
        displayContent = `
            <img class='boardsign' src='https://204180371.xyz/PicGo/PixPin_2025-01-28_12-31-48.png' title='休息喵……'>
            <span class='textTip'>
                <br> 本站居然运行了 ${days} 天
            </span>
            <span id='runtime'> ${hours} 小时 ${minutes} 分 ${seconds} 秒 </span>
            <i class='fas fa-heartbeat' style='color:red'></i>
        `;
    }

    // 更新页面内容
    const workboard = document.getElementById("workboard");
    if (workboard) {
        workboard.innerHTML = displayContent;
    }
}

// 每 250 毫秒更新一次
setInterval(() => {
    createtime();
}, 250);