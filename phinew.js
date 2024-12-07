import fetch from 'node-fetch'; 
import plugin from '../../lib/plugins/plugin.js';

const versionInfoURL = 'https://gitee.com/sczr/Phigros-update/raw/main/version_info.json';
const appendixURL = 'https://gitee.com/sczr/Phigros-update/raw/main/appendix.txt';
const constantsFileURL = 'https://gitee.com/sczr/Phigros-update/raw/main/song.txt'; // 固定文件名改为 song.txt
const readmeURL = 'https://gitee.com/catrong/phi-plugin/raw/main/README.md'; // GitHub README 的原始链接

// 获取文件内容并解析版本号，增加重试机制
async function getFileVersionAndContent(fileUrl, retries = 3, delay = 1000) {
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${fileUrl}`);
    }
    const text = await response.text();
    const version = text.split('\n')[0].trim(); // 假设版本号在第一行
    const content = text.slice(text.indexOf('\n') + 1).trim(); // 其余内容作为定数
    return { version, content }; // 返回版本号和定数内容
  } catch (error) {
    if (retries > 0) {
      console.warn(`Fetch failed, retrying... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay)); // 延迟后重试
      return getFileVersionAndContent(fileUrl, retries - 1, delay); // 递归重试
    } else {
      console.error('Error fetching file version and content:', error.message);
      return { version: '未知', content: '无法获取定数内容' }; // 返回默认值而不是 null
    }
  }
}

export class PhigrosUpdatePlugin extends plugin {
  constructor() {
    super({
      name: 'phi',
      dsc: 'Phigros 更新插件示例',
      event: 'message',
      priority: 100,
      rule: [
        {
          reg: '^[#/]new$', // 命令
          fnc: 'handlePhigrosUpdateCommand'
        },
        {
          reg: '^[#/]version$', // 获取游戏版本命令
          fnc: 'handleGameVersionCommand'
        },
        {
          reg: '^[#/]cloudbot$', // 云端版本检查命令
          fnc: 'handleCloudVersionCheck'
        },
        {
          reg: '^[#/]新曲信息帮助$',
          fnc: 'help',
        }
      ]
    });
  }

  async help(e) {
    logger.info('[用户命令]', e.msg);
    let msg = `【新曲信息帮助】\n/new\n可获取Phigros新版本信息\n/version\n可检查查分bot上游项目是否更新到新版本\n/cloudbot\n可检查当前bot是否与查分bot的上游项目同步`;
    await this.reply(`${msg}`);
    return true;
  }

  /** 获取文件内容 */
  async fetchFileContent(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${url} (status: ${response.status})`);
      }
      return await response.text();
    } catch (error) {
      console.error(`Error fetching file from ${url}:`, error.message);
      return null;
    }
  }

  /** 从 README 中提取 Phigros 游戏版本 */
  extractGameVersion(readmeContent) {
    // 正则表达式查找类似 "Phigros-3.10.2" 的部分
    const versionRegex = /Phigros-(\d+\.\d+\.\d+)/;
    const match = readmeContent.match(versionRegex);
    if (match && match[1]) {
      return match[1]; // 返回版本号，例如 "3.10.2"
    }
    return '未找到游戏版本信息';
  }

  // 获取版本信息
  async getVersionInfo() {
    try {
      const response = await fetch(versionInfoURL);
      if (!response.ok) {
        throw new Error('无法获取版本信息');
      }
      const versionInfo = await response.json();
      return versionInfo;
    } catch (error) {
      console.error('Error fetching version info:', error.message);
      return null;
    }
  }

  // 获取附言
  async getAppendix() {
    try {
      const response = await fetch(appendixURL);
      if (!response.ok) {
        throw new Error('无法获取附言');
      }
      return await response.text();
    } catch (error) {
      console.error('Error fetching appendix:', error.message);
      return null;
    }
  }

  // 获取当前时间，检查是否过了下午5点
  checkIfAfterFivePM() {
    const currentTime = new Date();
    return currentTime.getHours() >= 17;
  }

  // 获取当前日期，检查是否为更新当天
  isUpdateDay() {
    const currentDate = new Date(); // 获取当前时间
    const updateDate = new Date('2024-11-29'); // 使用 ISO 8601 格式创建日期对象

    // 比较当前日期与更新日期的年月日
    return currentDate.getFullYear() === updateDate.getFullYear() &&
      currentDate.getMonth() === updateDate.getMonth() &&
      currentDate.getDate() === updateDate.getDate();
  }

  async handlePhigrosUpdateCommand(e) {
    try {
      // 使用 Promise.all 并行化请求
      const versionInfoPromise = this.getVersionInfo(); // 获取版本信息
      const appendixPromise = this.getAppendix(); // 获取附言
      const constantsFilePromise = getFileVersionAndContent(constantsFileURL); // 获取定数文件内容
  
      // 等待所有请求完成
      const [versionInfo, appendix, constantsFile] = await Promise.all([
        versionInfoPromise, appendixPromise, constantsFilePromise
      ]);
  
      if (!versionInfo) {
        await e.reply('无法获取 Phigros 更新信息，请稍后再试。', false, { at: false });
        return;
      }
  
      const { version, date, log } = versionInfo;
      const { version: constantsFileVersion, content: songConstantsContent } = constantsFile;
  
      // 构建响应内容
      let response = `Phigros 更新信息\n版本号: ${version}\n更新日期: ${date.year}-${date.month}-${date.day}\n更新日志:\n${log}\n`;
  
      // 添加附言（如果存在）
      if (appendix) {
        response += `附言:\n${appendix.trim()}\n`;
      }
  
      // 比较当前版本与定数文件的版本号
      if (constantsFileVersion) {
        if (version > constantsFileVersion) {
          response += `\n上次更新曲目定数:\n${songConstantsContent}\n`;
        } else if (version === constantsFileVersion) {
          response += `\n新曲定数:\n${songConstantsContent}\n`;
        } else {
          response += `\n警告: 当前版本低于定数文件版本，可能存在问题。\n`;
        }
      } else {
        response += `\n无法获取定数文件版本，无法进行比较。\n`;
      }
  
      // 如果是更新当天，并且时间尚未过下午5点，提示新曲定数可能尚未发布
      if (this.isUpdateDay() && !this.checkIfAfterFivePM()) {
        response += `\n注意: 当前时间尚未过下午5点，更新的新曲定数可能尚未发布。`;
      }
  
      // 将消息转发格式化
      const forwardMessage = Bot.makeForwardArray([{
        type: 'text',
        data: {
          text: response
        }
      }]);
  
      // 发送转发消息
      await e.reply(forwardMessage);
  
    } catch (error) {
      console.error('Error in handlePhigrosUpdateCommand:', error.message);
      await e.reply('获取 Phigros 更新信息时发生错误，请稍后再试。', false, { at: false });
    }
  }
  

  /** 处理获取游戏版本的命令 */
  async handleGameVersionCommand(e) {
    try {
      // 获取README内容
      const readmeContent = await this.fetchFileContent(readmeURL);
      if (!readmeContent) {
        await e.reply('无法获取游戏版本信息，请稍后再试。', false, { at: false });
        return;
      }

      // 从README中提取游戏版本
      const gameVersion = this.extractGameVersion(readmeContent);

      // 返回游戏版本信息
      await e.reply(`当前Phi-Plugin插件适用的游戏版本: ${gameVersion}`, false, { at: false });
    } catch (error) {
      console.error('Error in handleGameVersionCommand:', error.message);
      await e.reply('获取游戏版本信息时发生错误，请稍后再试。', false, { at: false });
    }
  }

  /** 处理云端版本检查命令 */
  async handleCloudVersionCheck(e) {
    try {
      // 获取本地的 Phi-Plugin 版本
      const localVersion = await this.fetchFileContent(readmeURL);
      const localVersionMatch = localVersion.match(/Phigros-(\d+\.\d+\.\d+)/);
      const localVersionNumber = localVersionMatch ? localVersionMatch[1] : null;
      
      if (!localVersionNumber) {
        await e.reply('无法获取本地版本信息。', false, { at: false });
        return;
      }
      // 获取云端的 Phi-Plugin 版本
      const cloudVersion = await this.fetchFileContent(readmeURL);
      const cloudVersionMatch = cloudVersion.match(/Phigros-(\d+\.\d+\.\d+)/);
      const cloudVersionNumber = cloudVersionMatch ? cloudVersionMatch[1] : null;
      
      if (!cloudVersionNumber) {
        await e.reply('无法获取云端版本信息。', false, { at: false });
        return;
      }
      // 对比本地和云端版本
      if (localVersionNumber === cloudVersionNumber) {
        await e.reply('正常：本地和云端版本一致。', false, { at: false });
      } else if (localVersionNumber < cloudVersionNumber) {
        await e.reply(`警告：云端版本更新 (${cloudVersionNumber})，本地版本较旧 (${localVersionNumber})。`, false, { at: false });
      } else {
        await e.reply('本地版本较新，已是最新版本。', false, { at: false });
      }
    } catch (error) {
      console.error('Error in handleCloudVersionCheck:', error.message);
      await e.reply('获取云端版本信息时发生错误，请稍后再试。', false, { at: false });
    }
  }
}
