import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export class SelectSongs extends plugin {
  constructor() {
    super({
      name: "随机谱面选择",
      dsc: "随机选择满足条件的谱面",
      event: "message",
      priority: 5000,
      rule: [
        {
          reg: "^#随机课题(?:\\s(\\d+[+-]?))?(?:\\s(EZ|HD|IN|AT|ez|hd|in|at))?$",
          fnc: "selectSongs",
        },
      ],
    });
  }

  loadSongs() {
    const csvFilePath = path.join(__dirname, 'songs.csv');
    const csvData = fs.readFileSync(csvFilePath, 'utf-8');
    const rows = csvData.split('\n').filter((row) => row.trim() !== '');
    const header = rows.shift().split(',');

    const songs = [];
    for (const row of rows) {
      const columns = row.split(',');
      const song = {
        id: columns[0].trim(),
        EZ: parseFloat(columns[1]) || null,
        HD: parseFloat(columns[2]) || null,
        IN: parseFloat(columns[3]) || null,
        AT: parseFloat(columns[4]) || null,
      };
      songs.push(song);
    }
    return songs;
  }

  parseRangeCondition(condition) {
    if (!condition) return null;
    if (typeof condition === 'number') {
      return [condition, condition];
    }
    const lastChar = condition.slice(-1);
    if (lastChar === '+' || lastChar === '-') {
      const base = parseInt(condition.slice(0, -1), 10);
      return lastChar === '+' ? [base + 1, Infinity] : [0, base - 1];
    }
    const target = parseInt(condition, 10);
    return [target, target];
  }

  isConditionMet(range, sum) {
    return sum >= range[0] && sum <= range[1];
  }

  randomSelectSongs(songs, targetSumCondition = null, difficultyFilter = null) {
    const validDifficulties = ['EZ', 'HD', 'IN', 'AT'];
    const targetRange = this.parseRangeCondition(targetSumCondition);

    if (!targetRange) {
      return `无效的定数条件：${targetSumCondition}。`;
    }

    let filteredSongs = [];
    for (const song of songs) {
      if (difficultyFilter) {
        if (song[difficultyFilter] !== null) {
          filteredSongs.push({
            id: song.id,
            difficulty: difficultyFilter,
            rating: Math.floor(song[difficultyFilter]),
          });
        }
      } else {
        for (const difficulty of validDifficulties) {
          if (song[difficulty] !== null) {
            filteredSongs.push({
              id: song.id,
              difficulty: difficulty,
              rating: Math.floor(song[difficulty]),
            });
          }
        }
      }
    }

    if (filteredSongs.length === 0) {
      return `没有找到符合条件的谱面（难度: ${difficultyFilter || '全部'}, 定数条件: ${targetSumCondition}）。`;
    }

    const combinations = [];
    const ratings = filteredSongs.map((song) => song.rating);

    for (let i = 0; i < ratings.length - 2; i++) {
      for (let j = i + 1; j < ratings.length - 1; j++) {
        const requiredThird = targetRange[0] - ratings[i] - ratings[j];
        const upperLimitThird = targetRange[1] - ratings[i] - ratings[j];

        for (let k = j + 1; k < ratings.length; k++) {
          if (ratings[k] >= requiredThird && ratings[k] <= upperLimitThird) {
            combinations.push([filteredSongs[i], filteredSongs[j], filteredSongs[k]]);
          }
        }
      }
    }

    if (combinations.length === 0) {
      return `没有找到满足条件的谱面（难度: ${difficultyFilter || '全部'}, 定数条件: ${targetSumCondition}）。`;
    }

    const selectedCombo = combinations[Math.floor(Math.random() * combinations.length)];
    const shuffledCombo = selectedCombo.sort(() => Math.random() - 0.5);
    const result = shuffledCombo
      .map((song) => `${song.id} - ${song.difficulty} ${song.rating}`)
      .join('\n');
    const totalSum = shuffledCombo.reduce((sum, song) => sum + song.rating, 0);
    return `随机课题生成成功:\n${result}\n总和: ${totalSum}`;
  }

  async selectSongs(e) {
    const args = e.msg.replace('#随机课题', '').trim().split(' ');
    let targetSumCondition = null;
    let difficultyFilter = null;

    // 扫描传入的命令参数，优先解析数字和难度
    args.forEach((arg) => {
      if (!isNaN(arg)) {
        // 如果是数字，认为是定数总和限制
        targetSumCondition = parseInt(arg, 10);
      } else if (['EZ', 'HD', 'IN', 'AT'].includes(arg.toUpperCase())) {
        // 将传入的难度参数转换为大写
        difficultyFilter = arg.toUpperCase();
      }
    });

    // 如果只传入了难度限制，则根据难度调整定数范围
    if (difficultyFilter && !targetSumCondition) {
      switch (difficultyFilter) {
        case 'EZ':
          targetSumCondition = Math.floor(Math.random() * (24 - 3 + 1)) + 3; // 3到24
          break;
        case 'HD':
          targetSumCondition = Math.floor(Math.random() * (39 - 12 + 1)) + 12; // 12到39
          break;
        case 'IN':
          targetSumCondition = Math.floor(Math.random() * (45 - 24 + 1)) + 24; // 24到45
          break;
        case 'AT':
          targetSumCondition = Math.floor(Math.random() * (48 - 41 + 1)) + 41; // 41到48
          break;
        default:
          break;
      }
    }

    // 如果没有传入定数条件且没有指定难度，则默认生成一个随机范围（例如 3 到 48）
    if (!targetSumCondition) {
      targetSumCondition = Math.floor(Math.random() * (48 - 3 + 1)) + 3; // 生成 3 到 48 的随机数
    }

    // 确保 targetSumCondition 是一个有效的数字
    if (isNaN(targetSumCondition)) {
      e.reply('无效的定数条件');
      return;
    }

    // 调试日志：检查传入的参数和目标条件
    console.log(`接收到的命令参数： ${args}`);
    console.log(`定数条件（targetSumCondition）： ${targetSumCondition}`);
    console.log(`难度过滤条件（difficultyFilter）： ${difficultyFilter}`);

    try {
      const songs = this.loadSongs();
      const result = this.randomSelectSongs(songs, targetSumCondition, difficultyFilter);
      e.reply(result);
    } catch (error) {
      e.reply(`发生错误：${error.message}`);
    }
  }
}
