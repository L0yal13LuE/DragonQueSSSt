import { CallAgentOne } from './managers/agent/1-Assistant.js'

const responseText = await CallAgentOne('ข่าวเด็ดวันนี้มีอะไรบ้างนะ')

console.log(
    'Response Text => ',
    responseText
);