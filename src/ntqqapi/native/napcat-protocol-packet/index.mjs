import _0x2a5b9e from 'os';
import _0x28dee6 from 'node:fs';
import _0x5acf7e, { constants } from 'node:os';
import _0x56d2e7 from 'node:path';
import _0x2cf5c6, { createHash } from 'crypto';
import _0x49c13c, { dirname } from 'path';
import { fileURLToPath } from 'url';
import _0x3f08f4 from 'fs';

const _0x49b86f = {
	"3.2.12-28418-x64": {
	recv: "A0723E0",
	send: "A06EAE0"
},
	"9.9.15-28418-x64": {
	recv: "37A9004",
	send: "37A4BD0"
},
	"6.9.56-28418-x64": {
	send: "4471360",
	recv: "4473BCC"
},
	"6.9.56-28418-arm64": {
	send: "3FBDBF8",
	recv: "3FC0410"
},
	"9.9.15-28498-x64": {
	recv: "37A9004",
	send: "37A4BD0"
},
	"9.9.16-28788-x64": {
	send: "38076D0",
	recv: "380BB04"
},
	"3.2.13-28788-x64": {
	send: "A0CEC20",
	recv: "A0D2520"
},
	"3.2.13-28788-arm64": {
	send: "6E91018",
	recv: "6E94850"
},
	"9.9.16-28971-x64": {
	send: "38079F0",
	recv: "380BE24"
},
	"3.2.13-28971-x64": {
	send: "A0CEF60",
	recv: "A0D2860"
},
	"3.2.12-28971-arm64": {
	send: "6E91318",
	recv: "6E94B50"
},
	"6.9.58-28971-x64": {
	send: "449ACA0",
	recv: "449D50C"
},
	"6.9.58-28971-arm64": {
	send: "3FE0DB0",
	recv: "3FE35C8"
},
	"9.9.16-29271-x64": {
	send: "3833510",
	recv: "3837944"
},
	"3.2.13-29271-x64": {
	send: "A11E680",
	recv: "A121F80"
},
	"3.2.13-29271-arm64": {
	send: "6ECA098",
	recv: "6ECD8D0"
},
	"9.9.16-29456-x64": {
	send: "3835CD0",
	recv: "383A104"
},
	"3.2.13-29456-x64": {
	send: "A11E820",
	recv: "A122120"
},
	"3.2.13-29456-arm64": {
	send: "6ECA130",
	recv: "6ECD968"
},
	"6.9.59-29456-x64": {
	send: "44C57A0",
	recv: "44C800C"
},
	"6.9.59-29456-arm64": {
	send: "4005FE8",
	recv: "4008800"
}
};

const _0x9f4f57=_0xb062;(function(_0x4677c7,_0x3eb97c){const _0x1ccef5=_0xb062,_0x53e660=_0x4677c7();while(!![]){try{const _0x2f199d=parseInt(_0x1ccef5(0x1ef))/0x1*(-parseInt(_0x1ccef5(0x1f2))/0x2)+parseInt(_0x1ccef5(0x20b))/0x3+parseInt(_0x1ccef5(0x1e0))/0x4+parseInt(_0x1ccef5(0x1e4))/0x5+parseInt(_0x1ccef5(0x1e7))/0x6*(-parseInt(_0x1ccef5(0x208))/0x7)+-parseInt(_0x1ccef5(0x200))/0x8*(-parseInt(_0x1ccef5(0x1ee))/0x9)+parseInt(_0x1ccef5(0x201))/0xa;if(_0x2f199d===_0x3eb97c)break;else _0x53e660['push'](_0x53e660['shift']());}catch(_0x174179){_0x53e660['push'](_0x53e660['shift']());}}}(_0x1bc5,0x9b131));function _0xb062(_0x40891e,_0x260035){const _0x1bc5a0=_0x1bc5();return _0xb062=function(_0xb062e3,_0x53be9e){_0xb062e3=_0xb062e3-0x1dd;let _0x38df80=_0x1bc5a0[_0xb062e3];return _0x38df80;},_0xb062(_0x40891e,_0x260035);}function getQQVersionConfigPath(_0x918a9c=''){const _0x230db1=_0xb062;let _0x3d95b6;if(_0x5acf7e[_0x230db1(0x1e5)]()===_0x230db1(0x1f7))_0x3d95b6=_0x56d2e7[_0x230db1(0x205)](_0x56d2e7[_0x230db1(0x1df)](_0x918a9c),_0x230db1(0x202),'config.json');else {if(_0x5acf7e[_0x230db1(0x1e5)]()===_0x230db1(0x1e1)){const _0x5e9365=_0x5acf7e[_0x230db1(0x1ed)](),_0x110794=_0x56d2e7[_0x230db1(0x209)](_0x5e9365,_0x230db1(0x20d));_0x3d95b6=_0x56d2e7[_0x230db1(0x209)](_0x110794,_0x230db1(0x1f8));}else {const _0x4554e8=_0x5acf7e[_0x230db1(0x1ed)](),_0x4dad9e=_0x56d2e7[_0x230db1(0x209)](_0x4554e8,_0x230db1(0x1fe));_0x3d95b6=_0x56d2e7['resolve'](_0x4dad9e,_0x230db1(0x1f8));}}if(typeof _0x3d95b6!==_0x230db1(0x1f1))return void 0x0;!_0x28dee6[_0x230db1(0x1ea)](_0x3d95b6)&&(_0x3d95b6=_0x56d2e7['join'](_0x56d2e7['dirname'](_0x918a9c),_0x230db1(0x1de)));if(!_0x28dee6[_0x230db1(0x1ea)](_0x3d95b6))return void 0x0;return _0x3d95b6;}function getDefaultQQVersionConfigInfo(){const _0x3ec987=_0xb062;if(_0x5acf7e[_0x3ec987(0x1e5)]()==='linux')return {'baseVersion':_0x3ec987(0x1eb),'curVersion':_0x3ec987(0x1eb),'prevVersion':'','onErrorVersions':[],'buildId':'27254'};if(_0x5acf7e[_0x3ec987(0x1e5)]()===_0x3ec987(0x1e1))return {'baseVersion':_0x3ec987(0x204),'curVersion':_0x3ec987(0x204),'prevVersion':'','onErrorVersions':[],'buildId':_0x3ec987(0x20c)};return {'baseVersion':_0x3ec987(0x1ec),'curVersion':_0x3ec987(0x1ec),'prevVersion':'','onErrorVersions':[],'buildId':_0x3ec987(0x1e8)};}function getQQPackageInfoPath(_0x347e02='',_0x111b72){const _0x46b74d=_0xb062;let _0x28040c;if(_0x5acf7e[_0x46b74d(0x1e5)]()===_0x46b74d(0x1e1))_0x28040c=_0x56d2e7[_0x46b74d(0x205)](_0x56d2e7['dirname'](_0x347e02),'..','Resources',_0x46b74d(0x1fa),_0x46b74d(0x1f0));else _0x5acf7e[_0x46b74d(0x1e5)]()===_0x46b74d(0x1ff)?_0x28040c=_0x56d2e7[_0x46b74d(0x205)](_0x56d2e7[_0x46b74d(0x1df)](_0x347e02),_0x46b74d(0x1e3)):_0x28040c=_0x56d2e7[_0x46b74d(0x205)](_0x56d2e7['dirname'](_0x347e02),'./versions/'+_0x111b72+'/resources/app/package.json');return !_0x28dee6[_0x46b74d(0x1ea)](_0x28040c)&&(_0x28040c=_0x56d2e7[_0x46b74d(0x205)](_0x56d2e7[_0x46b74d(0x1df)](_0x347e02),'./resources/app/versions/'+_0x111b72+_0x46b74d(0x1fc))),_0x28040c;}function _0x1bc5(){const _0x334962=['/package.json','buildVersion','./.config/QQ','linux','126248caydZS','239150ibEpMi','versions','toString','6.9.53.28060','join','QQPackageInfo','isQuickUpdate','3572471xnsCSs','resolve','QQ版本获取失败','597885ByrmVY','28060','./Library/Application\x20Support/QQ','QQVersionConfigPath','curVersion','./resources/app/versions/config.json','dirname','2097608bVvKWQ','darwin','getQQBuildStr','./resources/app/package.json','1935715lbDalU','platform','QQVersionConfig','6GMNuah','28131','parse','existsSync','3.2.12.28060','9.9.15-28131','homedir','567FIolDU','49171ArxfXt','package.json','string','40NtRnKT','QQMainPath','execPath','version','readFileSync','win32','./versions/config.json','getFullQQVersion','app','QQPackageInfoPath'];_0x1bc5=function(){return _0x334962;};return _0x1bc5();}class QQBasicInfoWrapper{[_0x9f4f57(0x1f3)];[_0x9f4f57(0x1fb)];[_0x9f4f57(0x20e)];[_0x9f4f57(0x207)];['QQVersionConfig'];['QQPackageInfo'];constructor(){const _0x5c4885=_0x9f4f57;this[_0x5c4885(0x1f3)]=process[_0x5c4885(0x1f4)],this[_0x5c4885(0x20e)]=getQQVersionConfigPath(this['QQMainPath']),this[_0x5c4885(0x207)]=!!this[_0x5c4885(0x20e)],this[_0x5c4885(0x1e6)]=this[_0x5c4885(0x207)]?JSON[_0x5c4885(0x1e9)](_0x28dee6[_0x5c4885(0x1f6)](this[_0x5c4885(0x20e)])[_0x5c4885(0x203)]()):getDefaultQQVersionConfigInfo(),this['QQPackageInfoPath']=getQQPackageInfoPath(this['QQMainPath'],this['QQVersionConfig']?.['curVersion']),this[_0x5c4885(0x206)]=JSON['parse'](_0x28dee6[_0x5c4885(0x1f6)](this[_0x5c4885(0x1fb)])[_0x5c4885(0x203)]());}[_0x9f4f57(0x1f9)](){const _0x233b9c=_0x9f4f57,_0x3fd736=this[_0x233b9c(0x207)]?this['QQVersionConfig']?.[_0x233b9c(0x1dd)]:this[_0x233b9c(0x206)]?.[_0x233b9c(0x1f5)];if(!_0x3fd736)throw new Error(_0x233b9c(0x20a));return _0x3fd736;}[_0x9f4f57(0x1e2)](){const _0x40ce22=_0x9f4f57;return this[_0x40ce22(0x207)]?this['QQVersionConfig']?.['buildId']:this['QQPackageInfo']?.[_0x40ce22(0x1fd)];}}

function _0x22bf(_0x34237f,_0x56dde9){const _0x24a9bc=_0x24a9();return _0x22bf=function(_0x22bf7d,_0x4e86a4){_0x22bf7d=_0x22bf7d-0xcc;let _0x3809a6=_0x24a9bc[_0x22bf7d];return _0x3809a6;},_0x22bf(_0x34237f,_0x56dde9);}function _0x24a9(){const _0x6cbc55=['6237jQBHqm','648ZiMKuJ','put','capacity','set','9345pkFJUj','3pYLDIv','size','4354662LFCsWC','cache','710inXWlP','703632HADUWz','2540716sHmGlu','get','keys','5tMhjcW','has','1067616FTokra','79623VbwceC','444ZBlNRc','delete'];_0x24a9=function(){return _0x6cbc55;};return _0x24a9();}const _0x513d87=_0x22bf;(function(_0x463d93,_0x5cad68){const _0x206d41=_0x22bf,_0x3a2262=_0x463d93();while(!![]){try{const _0x510c97=parseInt(_0x206d41(0xcf))/0x1+parseInt(_0x206d41(0xd5))/0x2+parseInt(_0x206d41(0xdf))/0x3*(parseInt(_0x206d41(0xd0))/0x4)+parseInt(_0x206d41(0xd3))/0x5*(-parseInt(_0x206d41(0xcc))/0x6)+-parseInt(_0x206d41(0xde))/0x7*(parseInt(_0x206d41(0xda))/0x8)+-parseInt(_0x206d41(0xd6))/0x9*(parseInt(_0x206d41(0xce))/0xa)+-parseInt(_0x206d41(0xd9))/0xb*(parseInt(_0x206d41(0xd7))/0xc);if(_0x510c97===_0x5cad68)break;else _0x3a2262['push'](_0x3a2262['shift']());}catch(_0xa1abe){_0x3a2262['push'](_0x3a2262['shift']());}}}(_0x24a9,0x5f1d7));class LRUCache{[_0x513d87(0xdc)];[_0x513d87(0xcd)];constructor(_0x417fc0){const _0x46f8e3=_0x513d87;this[_0x46f8e3(0xdc)]=_0x417fc0,this[_0x46f8e3(0xcd)]=new Map();}[_0x513d87(0xd1)](_0x2fa537){const _0x519fc3=_0x513d87,_0x2ca232=this['cache'][_0x519fc3(0xd1)](_0x2fa537);return _0x2ca232!==void 0x0&&(this[_0x519fc3(0xcd)][_0x519fc3(0xd8)](_0x2fa537),this[_0x519fc3(0xcd)][_0x519fc3(0xdd)](_0x2fa537,_0x2ca232)),_0x2ca232;}[_0x513d87(0xdb)](_0xfa015d,_0x730cf7){const _0x2f0c34=_0x513d87;if(this[_0x2f0c34(0xcd)][_0x2f0c34(0xd4)](_0xfa015d))this['cache']['delete'](_0xfa015d);else {if(this['cache'][_0x2f0c34(0xe0)]>=this[_0x2f0c34(0xdc)]){const _0x4f08b9=this[_0x2f0c34(0xcd)][_0x2f0c34(0xd2)]()['next']()['value'];_0x4f08b9!==void 0x0&&this[_0x2f0c34(0xcd)]['delete'](_0x4f08b9);}}this[_0x2f0c34(0xcd)][_0x2f0c34(0xdd)](_0xfa015d,_0x730cf7);}}

const _0x240925=_0x18d6;function _0x1c4b(){const _0x5b901f=['2993940RyunOC','360828dmtzuR','115259ZCyTFA','2152456VUoLsm','4013317ZboZEv','4NPxKrs','1843827OUqdJL','v1.0.0','1985070zbSinf'];_0x1c4b=function(){return _0x5b901f;};return _0x1c4b();}function _0x18d6(_0x4021a2,_0x47853c){const _0x1c4b4d=_0x1c4b();return _0x18d6=function(_0x18d67c,_0x5e76b5){_0x18d67c=_0x18d67c-0xcb;let _0x175daf=_0x1c4b4d[_0x18d67c];return _0x175daf;},_0x18d6(_0x4021a2,_0x47853c);}(function(_0x2056d2,_0x56c165){const _0x57cb96=_0x18d6,_0x19b853=_0x2056d2();while(!![]){try{const _0x31ea70=parseInt(_0x57cb96(0xcb))/0x1+-parseInt(_0x57cb96(0xd3))/0x2+parseInt(_0x57cb96(0xcf))/0x3+-parseInt(_0x57cb96(0xce))/0x4*(parseInt(_0x57cb96(0xd1))/0x5)+parseInt(_0x57cb96(0xd2))/0x6+-parseInt(_0x57cb96(0xcd))/0x7+parseInt(_0x57cb96(0xcc))/0x8;if(_0x31ea70===_0x56c165)break;else _0x19b853['push'](_0x19b853['shift']());}catch(_0x4448ba){_0x19b853['push'](_0x19b853['shift']());}}}(_0x1c4b,0x54c14));const MoeHooVersion=_0x240925(0xd0);

const _0x387b3b=_0x166a;(function(_0x4b2af9,_0x962f0b){const _0x164bf0=_0x166a,_0x4e18d2=_0x4b2af9();while(!![]){try{const _0x6c6b64=-parseInt(_0x164bf0(0x141))/0x1+-parseInt(_0x164bf0(0x15f))/0x2*(-parseInt(_0x164bf0(0x155))/0x3)+parseInt(_0x164bf0(0x13a))/0x4*(-parseInt(_0x164bf0(0x176))/0x5)+parseInt(_0x164bf0(0x157))/0x6+-parseInt(_0x164bf0(0x161))/0x7+parseInt(_0x164bf0(0x159))/0x8+parseInt(_0x164bf0(0x160))/0x9*(parseInt(_0x164bf0(0x164))/0xa);if(_0x6c6b64===_0x962f0b)break;else _0x4e18d2['push'](_0x4e18d2['shift']());}catch(_0x43386d){_0x4e18d2['push'](_0x4e18d2['shift']());}}}(_0x2d12,0x8372a));function _0x2d12(){const _0x3044ce=['supportedPlatforms','floor','recv','129346oCDMtI','270WpGRsy','6797567AaQgAe','check','ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789','71410elkDGf','update','isAvailable','hex','[NTQQPacketApi]\x20moehoo_path_ori:','platform','digest','[NTQQPacketApi]\x20dlopen\x20','url','[NTQQPacketApi]\x20moehoo_path:','available','debug','darwin.arm64','sendSsoCmdReqByContend','getMsgService','sendOidbPacket','\x20ms\x20for\x20',',\x20recv\x20addr\x20','85MvNrle','data','init','registerCallback','wrapperSession','\x20with\x20trace_id\x20','sendPacket','[Core]\x20[Packet:Native]\x20缺失运行时文件:\x20','catch','./moehoo/MoeHoo.','.node','put','error','resolve','17092UbqaTR','connect','\x20complete','NapCat.Packet\x20未初始化！','linux.arm64','sendCommand','log','408825NoWwPW','[NTQQPacketApi]\x20MoeHoo\x20init\x20hook\x20send\x20addr\x20','arch','sendEvent','includes','MoeHooExport','SendPacket','[Core]\x20[Packet:Native]\x20不支持的平台:\x20','then','get','[NTQQPacketApi]\x20MoeHooExport','random','RTLD_LAZY','length','existsSync','dlopen','sendCommandImpl','join','[NTQQPacketApi]\x20开始检查支持的平台','\x20error:','42VTgabD','md5','1013118eGidyU','from','5619616ISWNBZ','exports','[NTQQPacketApi]\x20MoeHoo\x20init\x20complete'];_0x2d12=function(){return _0x3044ce;};return _0x2d12();}let currentPath=import.meta[_0x387b3b(0x16c)];currentPath=fileURLToPath(currentPath['url']??currentPath);const currentDir=dirname(currentPath),platform=process[_0x387b3b(0x169)]+'.'+process[_0x387b3b(0x143)],moehooPathOri=_0x49c13c['join'](currentDir,_0x387b3b(0x17f)+platform+'.node'),moehooPath=_0x49c13c[_0x387b3b(0x152)](currentDir,'./moehoo/MoeHoo.'+MoeHooVersion+_0x387b3b(0x136));function _0x166a(_0x907cea,_0x250be8){const _0x2d1207=_0x2d12();return _0x166a=function(_0x166aeb,_0x5af1aa){_0x166aeb=_0x166aeb-0x136;let _0x2aa8f9=_0x2d1207[_0x166aeb];return _0x2aa8f9;},_0x166a(_0x907cea,_0x250be8);}class PacketClient{['cb']=new LRUCache(0x1f4);[_0x387b3b(0x166)]=![];[_0x387b3b(0x17a)];constructor(_0x70100e){this['wrapperSession']=_0x70100e;}['randText'](_0x384221){const _0x4acf0c=_0x387b3b;let _0x1d511b='';const _0x3b6a30=_0x4acf0c(0x163);for(let _0x3301c9=0x0;_0x3301c9<_0x384221;_0x3301c9++){_0x1d511b+=_0x3b6a30['charAt'](Math[_0x4acf0c(0x15d)](Math[_0x4acf0c(0x14c)]()*_0x3b6a30[_0x4acf0c(0x14e)]));}return _0x1d511b;}get['available'](){return this['isAvailable'];}async['registerCallback'](_0x130430,_0x1ad0f7,_0x4d91c4){const _0x5c03fd=_0x387b3b;this['cb'][_0x5c03fd(0x137)](createHash(_0x5c03fd(0x156))[_0x5c03fd(0x165)](_0x130430)[_0x5c03fd(0x16a)]('hex')+_0x1ad0f7,_0x4d91c4);}async[_0x387b3b(0x13f)](_0x328b23,_0x48621d,_0x3c78cf,_0x14d23b=![],_0x29c46d=0x4e20,_0x4eb161=()=>{}){return new Promise((_0xa63e9,_0x17ff85)=>{const _0x4400a3=_0x166a,_0x77171=setTimeout(()=>{const _0x486d54=_0x166a;_0x17ff85(new Error('sendCommand\x20timed\x20out\x20after\x20'+_0x29c46d+_0x486d54(0x174)+_0x328b23+_0x486d54(0x17b)+_0x3c78cf));},_0x29c46d);this[_0x4400a3(0x179)](_0x3c78cf,'send',async _0x3b37a0=>{_0x4eb161(_0x3b37a0),!_0x14d23b&&(clearTimeout(_0x77171),_0xa63e9(_0x3b37a0));}),_0x14d23b&&this[_0x4400a3(0x179)](_0x3c78cf,_0x4400a3(0x15e),async _0x53113a=>{clearTimeout(_0x77171),_0xa63e9(_0x53113a);}),this[_0x4400a3(0x151)](_0x328b23,_0x48621d,_0x3c78cf);});}async[_0x387b3b(0x17c)](_0x222df2,_0x2d73ce,_0x51806b=![]){return new Promise((_0x5e864d,_0x203ea4)=>{const _0x1d932b=_0x166a;if(!this[_0x1d932b(0x16e)])return console['error'](_0x1d932b(0x13d)),void 0x0;const _0x40e3b6=_0x2cf5c6['createHash'](_0x1d932b(0x156))[_0x1d932b(0x165)](_0x2d73ce)[_0x1d932b(0x16a)]('hex'),_0x39b5fd=(this['randText'](0x4)+_0x40e3b6+_0x2d73ce)['slice'](0x0,_0x2d73ce['length']/0x2);this[_0x1d932b(0x13f)](_0x222df2,_0x2d73ce,_0x39b5fd,_0x51806b,0x4e20,async()=>{const _0x17942d=_0x1d932b;await this['wrapperSession'][_0x17942d(0x172)]()[_0x17942d(0x171)](_0x222df2,_0x39b5fd);})[_0x1d932b(0x149)](_0x520d87=>_0x5e864d(_0x520d87))[_0x1d932b(0x17e)](_0x302a31=>_0x203ea4(_0x302a31));});}async[_0x387b3b(0x173)](_0xc8fa1c,_0x138de7=![]){const _0x1ebb98=_0x387b3b;return this[_0x1ebb98(0x17c)](_0xc8fa1c['cmd'],_0xc8fa1c[_0x1ebb98(0x177)],_0x138de7);}}class NativePacketClient extends PacketClient{[_0x387b3b(0x15c)]=['win32.x64','linux.x64',_0x387b3b(0x13e),_0x387b3b(0x170)];[_0x387b3b(0x146)]={'exports':{}};[_0x387b3b(0x144)]=new LRUCache(0x1f4);constructor(_0x7feafc){super(_0x7feafc);}get['available'](){const _0x45da77=_0x387b3b;return this[_0x45da77(0x166)];}[_0x387b3b(0x162)](){const _0x47080f=_0x387b3b;console[_0x47080f(0x140)](_0x47080f(0x153));const _0x2885ce=process[_0x47080f(0x169)]+'.'+process[_0x47080f(0x143)];if(!this[_0x47080f(0x15c)][_0x47080f(0x145)](_0x2885ce))return console[_0x47080f(0x140)](_0x47080f(0x148)+_0x2885ce),![];if(!_0x3f08f4['existsSync'](moehooPathOri))return console['log'](_0x47080f(0x17d)+moehooPath),![];return !![];}async[_0x387b3b(0x178)](_0x106902,_0x2da465,_0x2fa422){const _0x3bfe80=_0x387b3b;console[_0x3bfe80(0x140)](_0x3bfe80(0x168),moehooPathOri),console[_0x3bfe80(0x140)](_0x3bfe80(0x16d),moehooPath);if(_0x3f08f4[_0x3bfe80(0x14f)](moehooPathOri)&&!_0x3f08f4[_0x3bfe80(0x14f)](moehooPath))try{_0x3f08f4['copyFileSync'](moehooPathOri,moehooPath);}catch(_0xc017cc){console['log']('[NTQQPacketApi]\x20copy\x20moehoo\x20error:',_0xc017cc);}try{process[_0x3bfe80(0x150)](this['MoeHooExport'],moehooPath,constants[_0x3bfe80(0x150)][_0x3bfe80(0x14d)]),console[_0x3bfe80(0x140)](_0x3bfe80(0x16b)+moehooPath+_0x3bfe80(0x13c));}catch(_0xcf55c4){console[_0x3bfe80(0x138)](_0x3bfe80(0x16b)+moehooPath+_0x3bfe80(0x154),_0xcf55c4);}try{console['log'](_0x3bfe80(0x14b),this[_0x3bfe80(0x146)]),console[_0x3bfe80(0x140)](_0x3bfe80(0x142)+_0x2fa422+_0x3bfe80(0x175)+_0x2da465),this['MoeHooExport']['exports']['InitHook']?.(_0x2fa422,_0x2da465,(_0x5333f2,_0x5f5284,_0x40f041,_0x227ad9,_0x4fe8ce)=>{const _0x1f338f=_0x3bfe80,_0xf2bf90=createHash(_0x1f338f(0x156))['update'](Buffer[_0x1f338f(0x158)](_0x4fe8ce,_0x1f338f(0x167)))[_0x1f338f(0x16a)]('hex');_0x5333f2===0x0&&this['cb'][_0x1f338f(0x14a)](_0xf2bf90+_0x1f338f(0x15e))&&this[_0x1f338f(0x144)]['put'](_0x227ad9,_0xf2bf90);if(_0x5333f2===0x1&&this[_0x1f338f(0x144)][_0x1f338f(0x14a)](_0x227ad9)){const _0x41dbe4=this[_0x1f338f(0x144)][_0x1f338f(0x14a)](_0x227ad9),_0x7d5732=this['cb'][_0x1f338f(0x14a)](_0x41dbe4+_0x1f338f(0x15e));_0x7d5732?.({'seq':_0x227ad9,'cmd':_0x40f041,'hex_data':_0x4fe8ce});}}),console[_0x3bfe80(0x16f)](_0x3bfe80(0x15b));}catch(_0x30363c){console[_0x3bfe80(0x138)]('[NTQQPacketApi]\x20MoeHoo\x20init\x20error:',_0x30363c);}this[_0x3bfe80(0x166)]=!![];}['sendCommandImpl'](_0x321775,_0x2842ed,_0x39545e){const _0x3a5c40=_0x387b3b,_0x3a2dd1=createHash(_0x3a5c40(0x156))['update'](_0x39545e)[_0x3a5c40(0x16a)]('hex');this[_0x3a5c40(0x146)][_0x3a5c40(0x15a)][_0x3a5c40(0x147)]?.(_0x321775,_0x2842ed,_0x3a2dd1),this['cb']['get'](_0x3a2dd1+'send')?.({'seq':0x0,'cmd':_0x321775,'hex_data':''});}[_0x387b3b(0x13b)](_0x30d149){const _0x4a3ed5=_0x387b3b;return _0x30d149(),Promise[_0x4a3ed5(0x139)]();}}

/**
 * Get the type of a JSON value.
 * Distinguishes between array, null and object.
 */
function typeofJsonValue(value) {
    let t = typeof value;
    if (t == "object") {
        if (Array.isArray(value))
            return "array";
        if (value === null)
            return "null";
    }
    return t;
}
/**
 * Is this a JSON object (instead of an array or null)?
 */
function isJsonObject(value) {
    return value !== null && typeof value == "object" && !Array.isArray(value);
}

// lookup table from base64 character to byte
let encTable = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('');
// lookup table from base64 character *code* to byte because lookup by number is fast
let decTable = [];
for (let i = 0; i < encTable.length; i++)
    decTable[encTable[i].charCodeAt(0)] = i;
// support base64url variants
decTable["-".charCodeAt(0)] = encTable.indexOf("+");
decTable["_".charCodeAt(0)] = encTable.indexOf("/");
/**
 * Decodes a base64 string to a byte array.
 *
 * - ignores white-space, including line breaks and tabs
 * - allows inner padding (can decode concatenated base64 strings)
 * - does not require padding
 * - understands base64url encoding:
 *   "-" instead of "+",
 *   "_" instead of "/",
 *   no padding
 */
function base64decode(base64Str) {
    // estimate byte size, not accounting for inner padding and whitespace
    let es = base64Str.length * 3 / 4;
    // if (es % 3 !== 0)
    // throw new Error('invalid base64 string');
    if (base64Str[base64Str.length - 2] == '=')
        es -= 2;
    else if (base64Str[base64Str.length - 1] == '=')
        es -= 1;
    let bytes = new Uint8Array(es), bytePos = 0, // position in byte array
    groupPos = 0, // position in base64 group
    b, // current byte
    p = 0 // previous byte
    ;
    for (let i = 0; i < base64Str.length; i++) {
        b = decTable[base64Str.charCodeAt(i)];
        if (b === undefined) {
            // noinspection FallThroughInSwitchStatementJS
            switch (base64Str[i]) {
                case '=':
                    groupPos = 0; // reset state when padding found
                case '\n':
                case '\r':
                case '\t':
                case ' ':
                    continue; // skip white-space, and padding
                default:
                    throw Error(`invalid base64 string.`);
            }
        }
        switch (groupPos) {
            case 0:
                p = b;
                groupPos = 1;
                break;
            case 1:
                bytes[bytePos++] = p << 2 | (b & 48) >> 4;
                p = b;
                groupPos = 2;
                break;
            case 2:
                bytes[bytePos++] = (p & 15) << 4 | (b & 60) >> 2;
                p = b;
                groupPos = 3;
                break;
            case 3:
                bytes[bytePos++] = (p & 3) << 6 | b;
                groupPos = 0;
                break;
        }
    }
    if (groupPos == 1)
        throw Error(`invalid base64 string.`);
    return bytes.subarray(0, bytePos);
}
/**
 * Encodes a byte array to a base64 string.
 * Adds padding at the end.
 * Does not insert newlines.
 */
function base64encode(bytes) {
    let base64 = '', groupPos = 0, // position in base64 group
    b, // current byte
    p = 0; // carry over from previous byte
    for (let i = 0; i < bytes.length; i++) {
        b = bytes[i];
        switch (groupPos) {
            case 0:
                base64 += encTable[b >> 2];
                p = (b & 3) << 4;
                groupPos = 1;
                break;
            case 1:
                base64 += encTable[p | b >> 4];
                p = (b & 15) << 2;
                groupPos = 2;
                break;
            case 2:
                base64 += encTable[p | b >> 6];
                base64 += encTable[b & 63];
                groupPos = 0;
                break;
        }
    }
    // padding required?
    if (groupPos) {
        base64 += encTable[p];
        base64 += '=';
        if (groupPos == 1)
            base64 += '=';
    }
    return base64;
}

/**
 * This handler implements the default behaviour for unknown fields.
 * When reading data, unknown fields are stored on the message, in a
 * symbol property.
 * When writing data, the symbol property is queried and unknown fields
 * are serialized into the output again.
 */
var UnknownFieldHandler;
(function (UnknownFieldHandler) {
    /**
     * The symbol used to store unknown fields for a message.
     * The property must conform to `UnknownFieldContainer`.
     */
    UnknownFieldHandler.symbol = Symbol.for("protobuf-ts/unknown");
    /**
     * Store an unknown field during binary read directly on the message.
     * This method is compatible with `BinaryReadOptions.readUnknownField`.
     */
    UnknownFieldHandler.onRead = (typeName, message, fieldNo, wireType, data) => {
        let container = is(message) ? message[UnknownFieldHandler.symbol] : message[UnknownFieldHandler.symbol] = [];
        container.push({ no: fieldNo, wireType, data });
    };
    /**
     * Write unknown fields stored for the message to the writer.
     * This method is compatible with `BinaryWriteOptions.writeUnknownFields`.
     */
    UnknownFieldHandler.onWrite = (typeName, message, writer) => {
        for (let { no, wireType, data } of UnknownFieldHandler.list(message))
            writer.tag(no, wireType).raw(data);
    };
    /**
     * List unknown fields stored for the message.
     * Note that there may be multiples fields with the same number.
     */
    UnknownFieldHandler.list = (message, fieldNo) => {
        if (is(message)) {
            let all = message[UnknownFieldHandler.symbol];
            return fieldNo ? all.filter(uf => uf.no == fieldNo) : all;
        }
        return [];
    };
    /**
     * Returns the last unknown field by field number.
     */
    UnknownFieldHandler.last = (message, fieldNo) => UnknownFieldHandler.list(message, fieldNo).slice(-1)[0];
    const is = (message) => message && Array.isArray(message[UnknownFieldHandler.symbol]);
})(UnknownFieldHandler || (UnknownFieldHandler = {}));
/**
 * Protobuf binary format wire types.
 *
 * A wire type provides just enough information to find the length of the
 * following value.
 *
 * See https://developers.google.com/protocol-buffers/docs/encoding#structure
 */
var WireType;
(function (WireType) {
    /**
     * Used for int32, int64, uint32, uint64, sint32, sint64, bool, enum
     */
    WireType[WireType["Varint"] = 0] = "Varint";
    /**
     * Used for fixed64, sfixed64, double.
     * Always 8 bytes with little-endian byte order.
     */
    WireType[WireType["Bit64"] = 1] = "Bit64";
    /**
     * Used for string, bytes, embedded messages, packed repeated fields
     *
     * Only repeated numeric types (types which use the varint, 32-bit,
     * or 64-bit wire types) can be packed. In proto3, such fields are
     * packed by default.
     */
    WireType[WireType["LengthDelimited"] = 2] = "LengthDelimited";
    /**
     * Used for groups
     * @deprecated
     */
    WireType[WireType["StartGroup"] = 3] = "StartGroup";
    /**
     * Used for groups
     * @deprecated
     */
    WireType[WireType["EndGroup"] = 4] = "EndGroup";
    /**
     * Used for fixed32, sfixed32, float.
     * Always 4 bytes with little-endian byte order.
     */
    WireType[WireType["Bit32"] = 5] = "Bit32";
})(WireType || (WireType = {}));

// Copyright 2008 Google Inc.  All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are
// met:
//
// * Redistributions of source code must retain the above copyright
// notice, this list of conditions and the following disclaimer.
// * Redistributions in binary form must reproduce the above
// copyright notice, this list of conditions and the following disclaimer
// in the documentation and/or other materials provided with the
// distribution.
// * Neither the name of Google Inc. nor the names of its
// contributors may be used to endorse or promote products derived from
// this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// Code generated by the Protocol Buffer compiler is owned by the owner
// of the input file used when generating it.  This code is not
// standalone and requires a support library to be linked with it.  This
// support library is itself covered by the above license.
/**
 * Read a 64 bit varint as two JS numbers.
 *
 * Returns tuple:
 * [0]: low bits
 * [0]: high bits
 *
 * Copyright 2008 Google Inc.  All rights reserved.
 *
 * See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/buffer_decoder.js#L175
 */
function varint64read() {
    let lowBits = 0;
    let highBits = 0;
    for (let shift = 0; shift < 28; shift += 7) {
        let b = this.buf[this.pos++];
        lowBits |= (b & 0x7F) << shift;
        if ((b & 0x80) == 0) {
            this.assertBounds();
            return [lowBits, highBits];
        }
    }
    let middleByte = this.buf[this.pos++];
    // last four bits of the first 32 bit number
    lowBits |= (middleByte & 0x0F) << 28;
    // 3 upper bits are part of the next 32 bit number
    highBits = (middleByte & 0x70) >> 4;
    if ((middleByte & 0x80) == 0) {
        this.assertBounds();
        return [lowBits, highBits];
    }
    for (let shift = 3; shift <= 31; shift += 7) {
        let b = this.buf[this.pos++];
        highBits |= (b & 0x7F) << shift;
        if ((b & 0x80) == 0) {
            this.assertBounds();
            return [lowBits, highBits];
        }
    }
    throw new Error('invalid varint');
}
/**
 * Write a 64 bit varint, given as two JS numbers, to the given bytes array.
 *
 * Copyright 2008 Google Inc.  All rights reserved.
 *
 * See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/writer.js#L344
 */
function varint64write(lo, hi, bytes) {
    for (let i = 0; i < 28; i = i + 7) {
        const shift = lo >>> i;
        const hasNext = !((shift >>> 7) == 0 && hi == 0);
        const byte = (hasNext ? shift | 0x80 : shift) & 0xFF;
        bytes.push(byte);
        if (!hasNext) {
            return;
        }
    }
    const splitBits = ((lo >>> 28) & 0x0F) | ((hi & 0x07) << 4);
    const hasMoreBits = !((hi >> 3) == 0);
    bytes.push((hasMoreBits ? splitBits | 0x80 : splitBits) & 0xFF);
    if (!hasMoreBits) {
        return;
    }
    for (let i = 3; i < 31; i = i + 7) {
        const shift = hi >>> i;
        const hasNext = !((shift >>> 7) == 0);
        const byte = (hasNext ? shift | 0x80 : shift) & 0xFF;
        bytes.push(byte);
        if (!hasNext) {
            return;
        }
    }
    bytes.push((hi >>> 31) & 0x01);
}
// constants for binary math
const TWO_PWR_32_DBL$1 = (1 << 16) * (1 << 16);
/**
 * Parse decimal string of 64 bit integer value as two JS numbers.
 *
 * Returns tuple:
 * [0]: minus sign?
 * [1]: low bits
 * [2]: high bits
 *
 * Copyright 2008 Google Inc.
 */
function int64fromString(dec) {
    // Check for minus sign.
    let minus = dec[0] == '-';
    if (minus)
        dec = dec.slice(1);
    // Work 6 decimal digits at a time, acting like we're converting base 1e6
    // digits to binary. This is safe to do with floating point math because
    // Number.isSafeInteger(ALL_32_BITS * 1e6) == true.
    const base = 1e6;
    let lowBits = 0;
    let highBits = 0;
    function add1e6digit(begin, end) {
        // Note: Number('') is 0.
        const digit1e6 = Number(dec.slice(begin, end));
        highBits *= base;
        lowBits = lowBits * base + digit1e6;
        // Carry bits from lowBits to highBits
        if (lowBits >= TWO_PWR_32_DBL$1) {
            highBits = highBits + ((lowBits / TWO_PWR_32_DBL$1) | 0);
            lowBits = lowBits % TWO_PWR_32_DBL$1;
        }
    }
    add1e6digit(-24, -18);
    add1e6digit(-18, -12);
    add1e6digit(-12, -6);
    add1e6digit(-6);
    return [minus, lowBits, highBits];
}
/**
 * Format 64 bit integer value (as two JS numbers) to decimal string.
 *
 * Copyright 2008 Google Inc.
 */
function int64toString(bitsLow, bitsHigh) {
    // Skip the expensive conversion if the number is small enough to use the
    // built-in conversions.
    if ((bitsHigh >>> 0) <= 0x1FFFFF) {
        return '' + (TWO_PWR_32_DBL$1 * bitsHigh + (bitsLow >>> 0));
    }
    // What this code is doing is essentially converting the input number from
    // base-2 to base-1e7, which allows us to represent the 64-bit range with
    // only 3 (very large) digits. Those digits are then trivial to convert to
    // a base-10 string.
    // The magic numbers used here are -
    // 2^24 = 16777216 = (1,6777216) in base-1e7.
    // 2^48 = 281474976710656 = (2,8147497,6710656) in base-1e7.
    // Split 32:32 representation into 16:24:24 representation so our
    // intermediate digits don't overflow.
    let low = bitsLow & 0xFFFFFF;
    let mid = (((bitsLow >>> 24) | (bitsHigh << 8)) >>> 0) & 0xFFFFFF;
    let high = (bitsHigh >> 16) & 0xFFFF;
    // Assemble our three base-1e7 digits, ignoring carries. The maximum
    // value in a digit at this step is representable as a 48-bit integer, which
    // can be stored in a 64-bit floating point number.
    let digitA = low + (mid * 6777216) + (high * 6710656);
    let digitB = mid + (high * 8147497);
    let digitC = (high * 2);
    // Apply carries from A to B and from B to C.
    let base = 10000000;
    if (digitA >= base) {
        digitB += Math.floor(digitA / base);
        digitA %= base;
    }
    if (digitB >= base) {
        digitC += Math.floor(digitB / base);
        digitB %= base;
    }
    // Convert base-1e7 digits to base-10, with optional leading zeroes.
    function decimalFrom1e7(digit1e7, needLeadingZeros) {
        let partial = digit1e7 ? String(digit1e7) : '';
        if (needLeadingZeros) {
            return '0000000'.slice(partial.length) + partial;
        }
        return partial;
    }
    return decimalFrom1e7(digitC, /*needLeadingZeros=*/ 0) +
        decimalFrom1e7(digitB, /*needLeadingZeros=*/ digitC) +
        // If the final 1e7 digit didn't need leading zeros, we would have
        // returned via the trivial code path at the top.
        decimalFrom1e7(digitA, /*needLeadingZeros=*/ 1);
}
/**
 * Write a 32 bit varint, signed or unsigned. Same as `varint64write(0, value, bytes)`
 *
 * Copyright 2008 Google Inc.  All rights reserved.
 *
 * See https://github.com/protocolbuffers/protobuf/blob/1b18833f4f2a2f681f4e4a25cdf3b0a43115ec26/js/binary/encoder.js#L144
 */
function varint32write(value, bytes) {
    if (value >= 0) {
        // write value as varint 32
        while (value > 0x7f) {
            bytes.push((value & 0x7f) | 0x80);
            value = value >>> 7;
        }
        bytes.push(value);
    }
    else {
        for (let i = 0; i < 9; i++) {
            bytes.push(value & 127 | 128);
            value = value >> 7;
        }
        bytes.push(1);
    }
}
/**
 * Read an unsigned 32 bit varint.
 *
 * See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/buffer_decoder.js#L220
 */
function varint32read() {
    let b = this.buf[this.pos++];
    let result = b & 0x7F;
    if ((b & 0x80) == 0) {
        this.assertBounds();
        return result;
    }
    b = this.buf[this.pos++];
    result |= (b & 0x7F) << 7;
    if ((b & 0x80) == 0) {
        this.assertBounds();
        return result;
    }
    b = this.buf[this.pos++];
    result |= (b & 0x7F) << 14;
    if ((b & 0x80) == 0) {
        this.assertBounds();
        return result;
    }
    b = this.buf[this.pos++];
    result |= (b & 0x7F) << 21;
    if ((b & 0x80) == 0) {
        this.assertBounds();
        return result;
    }
    // Extract only last 4 bits
    b = this.buf[this.pos++];
    result |= (b & 0x0F) << 28;
    for (let readBytes = 5; ((b & 0x80) !== 0) && readBytes < 10; readBytes++)
        b = this.buf[this.pos++];
    if ((b & 0x80) != 0)
        throw new Error('invalid varint');
    this.assertBounds();
    // Result can have 32 bits, convert it to unsigned
    return result >>> 0;
}

let BI;
function detectBi() {
    const dv = new DataView(new ArrayBuffer(8));
    const ok = globalThis.BigInt !== undefined
        && typeof dv.getBigInt64 === "function"
        && typeof dv.getBigUint64 === "function"
        && typeof dv.setBigInt64 === "function"
        && typeof dv.setBigUint64 === "function";
    BI = ok ? {
        MIN: BigInt("-9223372036854775808"),
        MAX: BigInt("9223372036854775807"),
        UMIN: BigInt("0"),
        UMAX: BigInt("18446744073709551615"),
        C: BigInt,
        V: dv,
    } : undefined;
}
detectBi();
function assertBi(bi) {
    if (!bi)
        throw new Error("BigInt unavailable, see https://github.com/timostamm/protobuf-ts/blob/v1.0.8/MANUAL.md#bigint-support");
}
// used to validate from(string) input (when bigint is unavailable)
const RE_DECIMAL_STR = /^-?[0-9]+$/;
// constants for binary math
const TWO_PWR_32_DBL = 0x100000000;
const HALF_2_PWR_32 = 0x080000000;
// base class for PbLong and PbULong provides shared code
class SharedPbLong {
    /**
     * Create a new instance with the given bits.
     */
    constructor(lo, hi) {
        this.lo = lo | 0;
        this.hi = hi | 0;
    }
    /**
     * Is this instance equal to 0?
     */
    isZero() {
        return this.lo == 0 && this.hi == 0;
    }
    /**
     * Convert to a native number.
     */
    toNumber() {
        let result = this.hi * TWO_PWR_32_DBL + (this.lo >>> 0);
        if (!Number.isSafeInteger(result))
            throw new Error("cannot convert to safe number");
        return result;
    }
}
/**
 * 64-bit unsigned integer as two 32-bit values.
 * Converts between `string`, `number` and `bigint` representations.
 */
class PbULong extends SharedPbLong {
    /**
     * Create instance from a `string`, `number` or `bigint`.
     */
    static from(value) {
        if (BI)
            // noinspection FallThroughInSwitchStatementJS
            switch (typeof value) {
                case "string":
                    if (value == "0")
                        return this.ZERO;
                    if (value == "")
                        throw new Error('string is no integer');
                    value = BI.C(value);
                case "number":
                    if (value === 0)
                        return this.ZERO;
                    value = BI.C(value);
                case "bigint":
                    if (!value)
                        return this.ZERO;
                    if (value < BI.UMIN)
                        throw new Error('signed value for ulong');
                    if (value > BI.UMAX)
                        throw new Error('ulong too large');
                    BI.V.setBigUint64(0, value, true);
                    return new PbULong(BI.V.getInt32(0, true), BI.V.getInt32(4, true));
            }
        else
            switch (typeof value) {
                case "string":
                    if (value == "0")
                        return this.ZERO;
                    value = value.trim();
                    if (!RE_DECIMAL_STR.test(value))
                        throw new Error('string is no integer');
                    let [minus, lo, hi] = int64fromString(value);
                    if (minus)
                        throw new Error('signed value for ulong');
                    return new PbULong(lo, hi);
                case "number":
                    if (value == 0)
                        return this.ZERO;
                    if (!Number.isSafeInteger(value))
                        throw new Error('number is no integer');
                    if (value < 0)
                        throw new Error('signed value for ulong');
                    return new PbULong(value, value / TWO_PWR_32_DBL);
            }
        throw new Error('unknown value ' + typeof value);
    }
    /**
     * Convert to decimal string.
     */
    toString() {
        return BI ? this.toBigInt().toString() : int64toString(this.lo, this.hi);
    }
    /**
     * Convert to native bigint.
     */
    toBigInt() {
        assertBi(BI);
        BI.V.setInt32(0, this.lo, true);
        BI.V.setInt32(4, this.hi, true);
        return BI.V.getBigUint64(0, true);
    }
}
/**
 * ulong 0 singleton.
 */
PbULong.ZERO = new PbULong(0, 0);
/**
 * 64-bit signed integer as two 32-bit values.
 * Converts between `string`, `number` and `bigint` representations.
 */
class PbLong extends SharedPbLong {
    /**
     * Create instance from a `string`, `number` or `bigint`.
     */
    static from(value) {
        if (BI)
            // noinspection FallThroughInSwitchStatementJS
            switch (typeof value) {
                case "string":
                    if (value == "0")
                        return this.ZERO;
                    if (value == "")
                        throw new Error('string is no integer');
                    value = BI.C(value);
                case "number":
                    if (value === 0)
                        return this.ZERO;
                    value = BI.C(value);
                case "bigint":
                    if (!value)
                        return this.ZERO;
                    if (value < BI.MIN)
                        throw new Error('signed long too small');
                    if (value > BI.MAX)
                        throw new Error('signed long too large');
                    BI.V.setBigInt64(0, value, true);
                    return new PbLong(BI.V.getInt32(0, true), BI.V.getInt32(4, true));
            }
        else
            switch (typeof value) {
                case "string":
                    if (value == "0")
                        return this.ZERO;
                    value = value.trim();
                    if (!RE_DECIMAL_STR.test(value))
                        throw new Error('string is no integer');
                    let [minus, lo, hi] = int64fromString(value);
                    if (minus) {
                        if (hi > HALF_2_PWR_32 || (hi == HALF_2_PWR_32 && lo != 0))
                            throw new Error('signed long too small');
                    }
                    else if (hi >= HALF_2_PWR_32)
                        throw new Error('signed long too large');
                    let pbl = new PbLong(lo, hi);
                    return minus ? pbl.negate() : pbl;
                case "number":
                    if (value == 0)
                        return this.ZERO;
                    if (!Number.isSafeInteger(value))
                        throw new Error('number is no integer');
                    return value > 0
                        ? new PbLong(value, value / TWO_PWR_32_DBL)
                        : new PbLong(-value, -value / TWO_PWR_32_DBL).negate();
            }
        throw new Error('unknown value ' + typeof value);
    }
    /**
     * Do we have a minus sign?
     */
    isNegative() {
        return (this.hi & HALF_2_PWR_32) !== 0;
    }
    /**
     * Negate two's complement.
     * Invert all the bits and add one to the result.
     */
    negate() {
        let hi = ~this.hi, lo = this.lo;
        if (lo)
            lo = ~lo + 1;
        else
            hi += 1;
        return new PbLong(lo, hi);
    }
    /**
     * Convert to decimal string.
     */
    toString() {
        if (BI)
            return this.toBigInt().toString();
        if (this.isNegative()) {
            let n = this.negate();
            return '-' + int64toString(n.lo, n.hi);
        }
        return int64toString(this.lo, this.hi);
    }
    /**
     * Convert to native bigint.
     */
    toBigInt() {
        assertBi(BI);
        BI.V.setInt32(0, this.lo, true);
        BI.V.setInt32(4, this.hi, true);
        return BI.V.getBigInt64(0, true);
    }
}
/**
 * long 0 singleton.
 */
PbLong.ZERO = new PbLong(0, 0);

const defaultsRead$1 = {
    readUnknownField: true,
    readerFactory: bytes => new BinaryReader(bytes),
};
/**
 * Make options for reading binary data form partial options.
 */
function binaryReadOptions(options) {
    return options ? Object.assign(Object.assign({}, defaultsRead$1), options) : defaultsRead$1;
}
class BinaryReader {
    constructor(buf, textDecoder) {
        this.varint64 = varint64read; // dirty cast for `this`
        /**
         * Read a `uint32` field, an unsigned 32 bit varint.
         */
        this.uint32 = varint32read; // dirty cast for `this` and access to protected `buf`
        this.buf = buf;
        this.len = buf.length;
        this.pos = 0;
        this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
        this.textDecoder = textDecoder !== null && textDecoder !== void 0 ? textDecoder : new TextDecoder("utf-8", {
            fatal: true,
            ignoreBOM: true,
        });
    }
    /**
     * Reads a tag - field number and wire type.
     */
    tag() {
        let tag = this.uint32(), fieldNo = tag >>> 3, wireType = tag & 7;
        if (fieldNo <= 0 || wireType < 0 || wireType > 5)
            throw new Error("illegal tag: field no " + fieldNo + " wire type " + wireType);
        return [fieldNo, wireType];
    }
    /**
     * Skip one element on the wire and return the skipped data.
     * Supports WireType.StartGroup since v2.0.0-alpha.23.
     */
    skip(wireType) {
        let start = this.pos;
        // noinspection FallThroughInSwitchStatementJS
        switch (wireType) {
            case WireType.Varint:
                while (this.buf[this.pos++] & 0x80) {
                    // ignore
                }
                break;
            case WireType.Bit64:
                this.pos += 4;
            case WireType.Bit32:
                this.pos += 4;
                break;
            case WireType.LengthDelimited:
                let len = this.uint32();
                this.pos += len;
                break;
            case WireType.StartGroup:
                // From descriptor.proto: Group type is deprecated, not supported in proto3.
                // But we must still be able to parse and treat as unknown.
                let t;
                while ((t = this.tag()[1]) !== WireType.EndGroup) {
                    this.skip(t);
                }
                break;
            default:
                throw new Error("cant skip wire type " + wireType);
        }
        this.assertBounds();
        return this.buf.subarray(start, this.pos);
    }
    /**
     * Throws error if position in byte array is out of range.
     */
    assertBounds() {
        if (this.pos > this.len)
            throw new RangeError("premature EOF");
    }
    /**
     * Read a `int32` field, a signed 32 bit varint.
     */
    int32() {
        return this.uint32() | 0;
    }
    /**
     * Read a `sint32` field, a signed, zigzag-encoded 32-bit varint.
     */
    sint32() {
        let zze = this.uint32();
        // decode zigzag
        return (zze >>> 1) ^ -(zze & 1);
    }
    /**
     * Read a `int64` field, a signed 64-bit varint.
     */
    int64() {
        return new PbLong(...this.varint64());
    }
    /**
     * Read a `uint64` field, an unsigned 64-bit varint.
     */
    uint64() {
        return new PbULong(...this.varint64());
    }
    /**
     * Read a `sint64` field, a signed, zig-zag-encoded 64-bit varint.
     */
    sint64() {
        let [lo, hi] = this.varint64();
        // decode zig zag
        let s = -(lo & 1);
        lo = ((lo >>> 1 | (hi & 1) << 31) ^ s);
        hi = (hi >>> 1 ^ s);
        return new PbLong(lo, hi);
    }
    /**
     * Read a `bool` field, a variant.
     */
    bool() {
        let [lo, hi] = this.varint64();
        return lo !== 0 || hi !== 0;
    }
    /**
     * Read a `fixed32` field, an unsigned, fixed-length 32-bit integer.
     */
    fixed32() {
        return this.view.getUint32((this.pos += 4) - 4, true);
    }
    /**
     * Read a `sfixed32` field, a signed, fixed-length 32-bit integer.
     */
    sfixed32() {
        return this.view.getInt32((this.pos += 4) - 4, true);
    }
    /**
     * Read a `fixed64` field, an unsigned, fixed-length 64 bit integer.
     */
    fixed64() {
        return new PbULong(this.sfixed32(), this.sfixed32());
    }
    /**
     * Read a `fixed64` field, a signed, fixed-length 64-bit integer.
     */
    sfixed64() {
        return new PbLong(this.sfixed32(), this.sfixed32());
    }
    /**
     * Read a `float` field, 32-bit floating point number.
     */
    float() {
        return this.view.getFloat32((this.pos += 4) - 4, true);
    }
    /**
     * Read a `double` field, a 64-bit floating point number.
     */
    double() {
        return this.view.getFloat64((this.pos += 8) - 8, true);
    }
    /**
     * Read a `bytes` field, length-delimited arbitrary data.
     */
    bytes() {
        let len = this.uint32();
        let start = this.pos;
        this.pos += len;
        this.assertBounds();
        return this.buf.subarray(start, start + len);
    }
    /**
     * Read a `string` field, length-delimited data converted to UTF-8 text.
     */
    string() {
        return this.textDecoder.decode(this.bytes());
    }
}

/**
 * assert that condition is true or throw error (with message)
 */
function assert(condition, msg) {
    if (!condition) {
        throw new Error(msg);
    }
}
const FLOAT32_MAX = 3.4028234663852886e+38, FLOAT32_MIN = -3.4028234663852886e+38, UINT32_MAX = 0xFFFFFFFF, INT32_MAX = 0X7FFFFFFF, INT32_MIN = -0X80000000;
function assertInt32(arg) {
    if (typeof arg !== "number")
        throw new Error('invalid int 32: ' + typeof arg);
    if (!Number.isInteger(arg) || arg > INT32_MAX || arg < INT32_MIN)
        throw new Error('invalid int 32: ' + arg);
}
function assertUInt32(arg) {
    if (typeof arg !== "number")
        throw new Error('invalid uint 32: ' + typeof arg);
    if (!Number.isInteger(arg) || arg > UINT32_MAX || arg < 0)
        throw new Error('invalid uint 32: ' + arg);
}
function assertFloat32(arg) {
    if (typeof arg !== "number")
        throw new Error('invalid float 32: ' + typeof arg);
    if (!Number.isFinite(arg))
        return;
    if (arg > FLOAT32_MAX || arg < FLOAT32_MIN)
        throw new Error('invalid float 32: ' + arg);
}

const defaultsWrite$1 = {
    writeUnknownFields: true,
    writerFactory: () => new BinaryWriter(),
};
/**
 * Make options for writing binary data form partial options.
 */
function binaryWriteOptions(options) {
    return options ? Object.assign(Object.assign({}, defaultsWrite$1), options) : defaultsWrite$1;
}
class BinaryWriter {
    constructor(textEncoder) {
        /**
         * Previous fork states.
         */
        this.stack = [];
        this.textEncoder = textEncoder !== null && textEncoder !== void 0 ? textEncoder : new TextEncoder();
        this.chunks = [];
        this.buf = [];
    }
    /**
     * Return all bytes written and reset this writer.
     */
    finish() {
        this.chunks.push(new Uint8Array(this.buf)); // flush the buffer
        let len = 0;
        for (let i = 0; i < this.chunks.length; i++)
            len += this.chunks[i].length;
        let bytes = new Uint8Array(len);
        let offset = 0;
        for (let i = 0; i < this.chunks.length; i++) {
            bytes.set(this.chunks[i], offset);
            offset += this.chunks[i].length;
        }
        this.chunks = [];
        return bytes;
    }
    /**
     * Start a new fork for length-delimited data like a message
     * or a packed repeated field.
     *
     * Must be joined later with `join()`.
     */
    fork() {
        this.stack.push({ chunks: this.chunks, buf: this.buf });
        this.chunks = [];
        this.buf = [];
        return this;
    }
    /**
     * Join the last fork. Write its length and bytes, then
     * return to the previous state.
     */
    join() {
        // get chunk of fork
        let chunk = this.finish();
        // restore previous state
        let prev = this.stack.pop();
        if (!prev)
            throw new Error('invalid state, fork stack empty');
        this.chunks = prev.chunks;
        this.buf = prev.buf;
        // write length of chunk as varint
        this.uint32(chunk.byteLength);
        return this.raw(chunk);
    }
    /**
     * Writes a tag (field number and wire type).
     *
     * Equivalent to `uint32( (fieldNo << 3 | type) >>> 0 )`.
     *
     * Generated code should compute the tag ahead of time and call `uint32()`.
     */
    tag(fieldNo, type) {
        return this.uint32((fieldNo << 3 | type) >>> 0);
    }
    /**
     * Write a chunk of raw bytes.
     */
    raw(chunk) {
        if (this.buf.length) {
            this.chunks.push(new Uint8Array(this.buf));
            this.buf = [];
        }
        this.chunks.push(chunk);
        return this;
    }
    /**
     * Write a `uint32` value, an unsigned 32 bit varint.
     */
    uint32(value) {
        assertUInt32(value);
        // write value as varint 32, inlined for speed
        while (value > 0x7f) {
            this.buf.push((value & 0x7f) | 0x80);
            value = value >>> 7;
        }
        this.buf.push(value);
        return this;
    }
    /**
     * Write a `int32` value, a signed 32 bit varint.
     */
    int32(value) {
        assertInt32(value);
        varint32write(value, this.buf);
        return this;
    }
    /**
     * Write a `bool` value, a variant.
     */
    bool(value) {
        this.buf.push(value ? 1 : 0);
        return this;
    }
    /**
     * Write a `bytes` value, length-delimited arbitrary data.
     */
    bytes(value) {
        this.uint32(value.byteLength); // write length of chunk as varint
        return this.raw(value);
    }
    /**
     * Write a `string` value, length-delimited data converted to UTF-8 text.
     */
    string(value) {
        let chunk = this.textEncoder.encode(value);
        this.uint32(chunk.byteLength); // write length of chunk as varint
        return this.raw(chunk);
    }
    /**
     * Write a `float` value, 32-bit floating point number.
     */
    float(value) {
        assertFloat32(value);
        let chunk = new Uint8Array(4);
        new DataView(chunk.buffer).setFloat32(0, value, true);
        return this.raw(chunk);
    }
    /**
     * Write a `double` value, a 64-bit floating point number.
     */
    double(value) {
        let chunk = new Uint8Array(8);
        new DataView(chunk.buffer).setFloat64(0, value, true);
        return this.raw(chunk);
    }
    /**
     * Write a `fixed32` value, an unsigned, fixed-length 32-bit integer.
     */
    fixed32(value) {
        assertUInt32(value);
        let chunk = new Uint8Array(4);
        new DataView(chunk.buffer).setUint32(0, value, true);
        return this.raw(chunk);
    }
    /**
     * Write a `sfixed32` value, a signed, fixed-length 32-bit integer.
     */
    sfixed32(value) {
        assertInt32(value);
        let chunk = new Uint8Array(4);
        new DataView(chunk.buffer).setInt32(0, value, true);
        return this.raw(chunk);
    }
    /**
     * Write a `sint32` value, a signed, zigzag-encoded 32-bit varint.
     */
    sint32(value) {
        assertInt32(value);
        // zigzag encode
        value = ((value << 1) ^ (value >> 31)) >>> 0;
        varint32write(value, this.buf);
        return this;
    }
    /**
     * Write a `fixed64` value, a signed, fixed-length 64-bit integer.
     */
    sfixed64(value) {
        let chunk = new Uint8Array(8);
        let view = new DataView(chunk.buffer);
        let long = PbLong.from(value);
        view.setInt32(0, long.lo, true);
        view.setInt32(4, long.hi, true);
        return this.raw(chunk);
    }
    /**
     * Write a `fixed64` value, an unsigned, fixed-length 64 bit integer.
     */
    fixed64(value) {
        let chunk = new Uint8Array(8);
        let view = new DataView(chunk.buffer);
        let long = PbULong.from(value);
        view.setInt32(0, long.lo, true);
        view.setInt32(4, long.hi, true);
        return this.raw(chunk);
    }
    /**
     * Write a `int64` value, a signed 64-bit varint.
     */
    int64(value) {
        let long = PbLong.from(value);
        varint64write(long.lo, long.hi, this.buf);
        return this;
    }
    /**
     * Write a `sint64` value, a signed, zig-zag-encoded 64-bit varint.
     */
    sint64(value) {
        let long = PbLong.from(value), 
        // zigzag encode
        sign = long.hi >> 31, lo = (long.lo << 1) ^ sign, hi = ((long.hi << 1) | (long.lo >>> 31)) ^ sign;
        varint64write(lo, hi, this.buf);
        return this;
    }
    /**
     * Write a `uint64` value, an unsigned 64-bit varint.
     */
    uint64(value) {
        let long = PbULong.from(value);
        varint64write(long.lo, long.hi, this.buf);
        return this;
    }
}

const defaultsWrite = {
    emitDefaultValues: false,
    enumAsInteger: false,
    useProtoFieldName: false,
    prettySpaces: 0,
}, defaultsRead = {
    ignoreUnknownFields: false,
};
/**
 * Make options for reading JSON data from partial options.
 */
function jsonReadOptions(options) {
    return options ? Object.assign(Object.assign({}, defaultsRead), options) : defaultsRead;
}
/**
 * Make options for writing JSON data from partial options.
 */
function jsonWriteOptions(options) {
    return options ? Object.assign(Object.assign({}, defaultsWrite), options) : defaultsWrite;
}

/**
 * The symbol used as a key on message objects to store the message type.
 *
 * Note that this is an experimental feature - it is here to stay, but
 * implementation details may change without notice.
 */
const MESSAGE_TYPE = Symbol.for("protobuf-ts/message-type");

/**
 * Converts snake_case to lowerCamelCase.
 *
 * Should behave like protoc:
 * https://github.com/protocolbuffers/protobuf/blob/e8ae137c96444ea313485ed1118c5e43b2099cf1/src/google/protobuf/compiler/java/java_helpers.cc#L118
 */
function lowerCamelCase(snakeCase) {
    let capNext = false;
    const sb = [];
    for (let i = 0; i < snakeCase.length; i++) {
        let next = snakeCase.charAt(i);
        if (next == '_') {
            capNext = true;
        }
        else if (/\d/.test(next)) {
            sb.push(next);
            capNext = true;
        }
        else if (capNext) {
            sb.push(next.toUpperCase());
            capNext = false;
        }
        else if (i == 0) {
            sb.push(next.toLowerCase());
        }
        else {
            sb.push(next);
        }
    }
    return sb.join('');
}

/**
 * Scalar value types. This is a subset of field types declared by protobuf
 * enum google.protobuf.FieldDescriptorProto.Type The types GROUP and MESSAGE
 * are omitted, but the numerical values are identical.
 */
var ScalarType;
(function (ScalarType) {
    // 0 is reserved for errors.
    // Order is weird for historical reasons.
    ScalarType[ScalarType["DOUBLE"] = 1] = "DOUBLE";
    ScalarType[ScalarType["FLOAT"] = 2] = "FLOAT";
    // Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT64 if
    // negative values are likely.
    ScalarType[ScalarType["INT64"] = 3] = "INT64";
    ScalarType[ScalarType["UINT64"] = 4] = "UINT64";
    // Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT32 if
    // negative values are likely.
    ScalarType[ScalarType["INT32"] = 5] = "INT32";
    ScalarType[ScalarType["FIXED64"] = 6] = "FIXED64";
    ScalarType[ScalarType["FIXED32"] = 7] = "FIXED32";
    ScalarType[ScalarType["BOOL"] = 8] = "BOOL";
    ScalarType[ScalarType["STRING"] = 9] = "STRING";
    // Tag-delimited aggregate.
    // Group type is deprecated and not supported in proto3. However, Proto3
    // implementations should still be able to parse the group wire format and
    // treat group fields as unknown fields.
    // TYPE_GROUP = 10,
    // TYPE_MESSAGE = 11,  // Length-delimited aggregate.
    // New in version 2.
    ScalarType[ScalarType["BYTES"] = 12] = "BYTES";
    ScalarType[ScalarType["UINT32"] = 13] = "UINT32";
    // TYPE_ENUM = 14,
    ScalarType[ScalarType["SFIXED32"] = 15] = "SFIXED32";
    ScalarType[ScalarType["SFIXED64"] = 16] = "SFIXED64";
    ScalarType[ScalarType["SINT32"] = 17] = "SINT32";
    ScalarType[ScalarType["SINT64"] = 18] = "SINT64";
})(ScalarType || (ScalarType = {}));
/**
 * JavaScript representation of 64 bit integral types. Equivalent to the
 * field option "jstype".
 *
 * By default, protobuf-ts represents 64 bit types as `bigint`.
 *
 * You can change the default behaviour by enabling the plugin parameter
 * `long_type_string`, which will represent 64 bit types as `string`.
 *
 * Alternatively, you can change the behaviour for individual fields
 * with the field option "jstype":
 *
 * ```protobuf
 * uint64 my_field = 1 [jstype = JS_STRING];
 * uint64 other_field = 2 [jstype = JS_NUMBER];
 * ```
 */
var LongType;
(function (LongType) {
    /**
     * Use JavaScript `bigint`.
     *
     * Field option `[jstype = JS_NORMAL]`.
     */
    LongType[LongType["BIGINT"] = 0] = "BIGINT";
    /**
     * Use JavaScript `string`.
     *
     * Field option `[jstype = JS_STRING]`.
     */
    LongType[LongType["STRING"] = 1] = "STRING";
    /**
     * Use JavaScript `number`.
     *
     * Large values will loose precision.
     *
     * Field option `[jstype = JS_NUMBER]`.
     */
    LongType[LongType["NUMBER"] = 2] = "NUMBER";
})(LongType || (LongType = {}));
/**
 * Protobuf 2.1.0 introduced packed repeated fields.
 * Setting the field option `[packed = true]` enables packing.
 *
 * In proto3, all repeated fields are packed by default.
 * Setting the field option `[packed = false]` disables packing.
 *
 * Packed repeated fields are encoded with a single tag,
 * then a length-delimiter, then the element values.
 *
 * Unpacked repeated fields are encoded with a tag and
 * value for each element.
 *
 * `bytes` and `string` cannot be packed.
 */
var RepeatType;
(function (RepeatType) {
    /**
     * The field is not repeated.
     */
    RepeatType[RepeatType["NO"] = 0] = "NO";
    /**
     * The field is repeated and should be packed.
     * Invalid for `bytes` and `string`, they cannot be packed.
     */
    RepeatType[RepeatType["PACKED"] = 1] = "PACKED";
    /**
     * The field is repeated but should not be packed.
     * The only valid repeat type for repeated `bytes` and `string`.
     */
    RepeatType[RepeatType["UNPACKED"] = 2] = "UNPACKED";
})(RepeatType || (RepeatType = {}));
/**
 * Turns PartialFieldInfo into FieldInfo.
 */
function normalizeFieldInfo(field) {
    var _a, _b, _c, _d;
    field.localName = (_a = field.localName) !== null && _a !== void 0 ? _a : lowerCamelCase(field.name);
    field.jsonName = (_b = field.jsonName) !== null && _b !== void 0 ? _b : lowerCamelCase(field.name);
    field.repeat = (_c = field.repeat) !== null && _c !== void 0 ? _c : RepeatType.NO;
    field.opt = (_d = field.opt) !== null && _d !== void 0 ? _d : (field.repeat ? false : field.oneof ? false : field.kind == "message");
    return field;
}

/**
 * Is the given value a valid oneof group?
 *
 * We represent protobuf `oneof` as algebraic data types (ADT) in generated
 * code. But when working with messages of unknown type, the ADT does not
 * help us.
 *
 * This type guard checks if the given object adheres to the ADT rules, which
 * are as follows:
 *
 * 1) Must be an object.
 *
 * 2) Must have a "oneofKind" discriminator property.
 *
 * 3) If "oneofKind" is `undefined`, no member field is selected. The object
 * must not have any other properties.
 *
 * 4) If "oneofKind" is a `string`, the member field with this name is
 * selected.
 *
 * 5) If a member field is selected, the object must have a second property
 * with this name. The property must not be `undefined`.
 *
 * 6) No extra properties are allowed. The object has either one property
 * (no selection) or two properties (selection).
 *
 */
function isOneofGroup(any) {
    if (typeof any != 'object' || any === null || !any.hasOwnProperty('oneofKind')) {
        return false;
    }
    switch (typeof any.oneofKind) {
        case "string":
            if (any[any.oneofKind] === undefined)
                return false;
            return Object.keys(any).length == 2;
        case "undefined":
            return Object.keys(any).length == 1;
        default:
            return false;
    }
}

// noinspection JSMethodCanBeStatic
class ReflectionTypeCheck {
    constructor(info) {
        var _a;
        this.fields = (_a = info.fields) !== null && _a !== void 0 ? _a : [];
    }
    prepare() {
        if (this.data)
            return;
        const req = [], known = [], oneofs = [];
        for (let field of this.fields) {
            if (field.oneof) {
                if (!oneofs.includes(field.oneof)) {
                    oneofs.push(field.oneof);
                    req.push(field.oneof);
                    known.push(field.oneof);
                }
            }
            else {
                known.push(field.localName);
                switch (field.kind) {
                    case "scalar":
                    case "enum":
                        if (!field.opt || field.repeat)
                            req.push(field.localName);
                        break;
                    case "message":
                        if (field.repeat)
                            req.push(field.localName);
                        break;
                    case "map":
                        req.push(field.localName);
                        break;
                }
            }
        }
        this.data = { req, known, oneofs: Object.values(oneofs) };
    }
    /**
     * Is the argument a valid message as specified by the
     * reflection information?
     *
     * Checks all field types recursively. The `depth`
     * specifies how deep into the structure the check will be.
     *
     * With a depth of 0, only the presence of fields
     * is checked.
     *
     * With a depth of 1 or more, the field types are checked.
     *
     * With a depth of 2 or more, the members of map, repeated
     * and message fields are checked.
     *
     * Message fields will be checked recursively with depth - 1.
     *
     * The number of map entries / repeated values being checked
     * is < depth.
     */
    is(message, depth, allowExcessProperties = false) {
        if (depth < 0)
            return true;
        if (message === null || message === undefined || typeof message != 'object')
            return false;
        this.prepare();
        let keys = Object.keys(message), data = this.data;
        // if a required field is missing in arg, this cannot be a T
        if (keys.length < data.req.length || data.req.some(n => !keys.includes(n)))
            return false;
        if (!allowExcessProperties) {
            // if the arg contains a key we dont know, this is not a literal T
            if (keys.some(k => !data.known.includes(k)))
                return false;
        }
        // "With a depth of 0, only the presence and absence of fields is checked."
        // "With a depth of 1 or more, the field types are checked."
        if (depth < 1) {
            return true;
        }
        // check oneof group
        for (const name of data.oneofs) {
            const group = message[name];
            if (!isOneofGroup(group))
                return false;
            if (group.oneofKind === undefined)
                continue;
            const field = this.fields.find(f => f.localName === group.oneofKind);
            if (!field)
                return false; // we found no field, but have a kind, something is wrong
            if (!this.field(group[group.oneofKind], field, allowExcessProperties, depth))
                return false;
        }
        // check types
        for (const field of this.fields) {
            if (field.oneof !== undefined)
                continue;
            if (!this.field(message[field.localName], field, allowExcessProperties, depth))
                return false;
        }
        return true;
    }
    field(arg, field, allowExcessProperties, depth) {
        let repeated = field.repeat;
        switch (field.kind) {
            case "scalar":
                if (arg === undefined)
                    return field.opt;
                if (repeated)
                    return this.scalars(arg, field.T, depth, field.L);
                return this.scalar(arg, field.T, field.L);
            case "enum":
                if (arg === undefined)
                    return field.opt;
                if (repeated)
                    return this.scalars(arg, ScalarType.INT32, depth);
                return this.scalar(arg, ScalarType.INT32);
            case "message":
                if (arg === undefined)
                    return true;
                if (repeated)
                    return this.messages(arg, field.T(), allowExcessProperties, depth);
                return this.message(arg, field.T(), allowExcessProperties, depth);
            case "map":
                if (typeof arg != 'object' || arg === null)
                    return false;
                if (depth < 2)
                    return true;
                if (!this.mapKeys(arg, field.K, depth))
                    return false;
                switch (field.V.kind) {
                    case "scalar":
                        return this.scalars(Object.values(arg), field.V.T, depth, field.V.L);
                    case "enum":
                        return this.scalars(Object.values(arg), ScalarType.INT32, depth);
                    case "message":
                        return this.messages(Object.values(arg), field.V.T(), allowExcessProperties, depth);
                }
                break;
        }
        return true;
    }
    message(arg, type, allowExcessProperties, depth) {
        if (allowExcessProperties) {
            return type.isAssignable(arg, depth);
        }
        return type.is(arg, depth);
    }
    messages(arg, type, allowExcessProperties, depth) {
        if (!Array.isArray(arg))
            return false;
        if (depth < 2)
            return true;
        if (allowExcessProperties) {
            for (let i = 0; i < arg.length && i < depth; i++)
                if (!type.isAssignable(arg[i], depth - 1))
                    return false;
        }
        else {
            for (let i = 0; i < arg.length && i < depth; i++)
                if (!type.is(arg[i], depth - 1))
                    return false;
        }
        return true;
    }
    scalar(arg, type, longType) {
        let argType = typeof arg;
        switch (type) {
            case ScalarType.UINT64:
            case ScalarType.FIXED64:
            case ScalarType.INT64:
            case ScalarType.SFIXED64:
            case ScalarType.SINT64:
                switch (longType) {
                    case LongType.BIGINT:
                        return argType == "bigint";
                    case LongType.NUMBER:
                        return argType == "number" && !isNaN(arg);
                    default:
                        return argType == "string";
                }
            case ScalarType.BOOL:
                return argType == 'boolean';
            case ScalarType.STRING:
                return argType == 'string';
            case ScalarType.BYTES:
                return arg instanceof Uint8Array;
            case ScalarType.DOUBLE:
            case ScalarType.FLOAT:
                return argType == 'number' && !isNaN(arg);
            default:
                // case ScalarType.UINT32:
                // case ScalarType.FIXED32:
                // case ScalarType.INT32:
                // case ScalarType.SINT32:
                // case ScalarType.SFIXED32:
                return argType == 'number' && Number.isInteger(arg);
        }
    }
    scalars(arg, type, depth, longType) {
        if (!Array.isArray(arg))
            return false;
        if (depth < 2)
            return true;
        if (Array.isArray(arg))
            for (let i = 0; i < arg.length && i < depth; i++)
                if (!this.scalar(arg[i], type, longType))
                    return false;
        return true;
    }
    mapKeys(map, type, depth) {
        let keys = Object.keys(map);
        switch (type) {
            case ScalarType.INT32:
            case ScalarType.FIXED32:
            case ScalarType.SFIXED32:
            case ScalarType.SINT32:
            case ScalarType.UINT32:
                return this.scalars(keys.slice(0, depth).map(k => parseInt(k)), type, depth);
            case ScalarType.BOOL:
                return this.scalars(keys.slice(0, depth).map(k => k == 'true' ? true : k == 'false' ? false : k), type, depth);
            default:
                return this.scalars(keys, type, depth, LongType.STRING);
        }
    }
}

/**
 * Utility method to convert a PbLong or PbUlong to a JavaScript
 * representation during runtime.
 *
 * Works with generated field information, `undefined` is equivalent
 * to `STRING`.
 */
function reflectionLongConvert(long, type) {
    switch (type) {
        case LongType.BIGINT:
            return long.toBigInt();
        case LongType.NUMBER:
            return long.toNumber();
        default:
            // case undefined:
            // case LongType.STRING:
            return long.toString();
    }
}

/**
 * Reads proto3 messages in canonical JSON format using reflection information.
 *
 * https://developers.google.com/protocol-buffers/docs/proto3#json
 */
class ReflectionJsonReader {
    constructor(info) {
        this.info = info;
    }
    prepare() {
        var _a;
        if (this.fMap === undefined) {
            this.fMap = {};
            const fieldsInput = (_a = this.info.fields) !== null && _a !== void 0 ? _a : [];
            for (const field of fieldsInput) {
                this.fMap[field.name] = field;
                this.fMap[field.jsonName] = field;
                this.fMap[field.localName] = field;
            }
        }
    }
    // Cannot parse JSON <type of jsonValue> for <type name>#<fieldName>.
    assert(condition, fieldName, jsonValue) {
        if (!condition) {
            let what = typeofJsonValue(jsonValue);
            if (what == "number" || what == "boolean")
                what = jsonValue.toString();
            throw new Error(`Cannot parse JSON ${what} for ${this.info.typeName}#${fieldName}`);
        }
    }
    /**
     * Reads a message from canonical JSON format into the target message.
     *
     * Repeated fields are appended. Map entries are added, overwriting
     * existing keys.
     *
     * If a message field is already present, it will be merged with the
     * new data.
     */
    read(input, message, options) {
        this.prepare();
        const oneofsHandled = [];
        for (const [jsonKey, jsonValue] of Object.entries(input)) {
            const field = this.fMap[jsonKey];
            if (!field) {
                if (!options.ignoreUnknownFields)
                    throw new Error(`Found unknown field while reading ${this.info.typeName} from JSON format. JSON key: ${jsonKey}`);
                continue;
            }
            const localName = field.localName;
            // handle oneof ADT
            let target; // this will be the target for the field value, whether it is member of a oneof or not
            if (field.oneof) {
                if (jsonValue === null && (field.kind !== 'enum' || field.T()[0] !== 'google.protobuf.NullValue')) {
                    continue;
                }
                // since json objects are unordered by specification, it is not possible to take the last of multiple oneofs
                if (oneofsHandled.includes(field.oneof))
                    throw new Error(`Multiple members of the oneof group "${field.oneof}" of ${this.info.typeName} are present in JSON.`);
                oneofsHandled.push(field.oneof);
                target = message[field.oneof] = {
                    oneofKind: localName
                };
            }
            else {
                target = message;
            }
            // we have handled oneof above. we just have read the value into `target`.
            if (field.kind == 'map') {
                if (jsonValue === null) {
                    continue;
                }
                // check input
                this.assert(isJsonObject(jsonValue), field.name, jsonValue);
                // our target to put map entries into
                const fieldObj = target[localName];
                // read entries
                for (const [jsonObjKey, jsonObjValue] of Object.entries(jsonValue)) {
                    this.assert(jsonObjValue !== null, field.name + " map value", null);
                    // read value
                    let val;
                    switch (field.V.kind) {
                        case "message":
                            val = field.V.T().internalJsonRead(jsonObjValue, options);
                            break;
                        case "enum":
                            val = this.enum(field.V.T(), jsonObjValue, field.name, options.ignoreUnknownFields);
                            if (val === false)
                                continue;
                            break;
                        case "scalar":
                            val = this.scalar(jsonObjValue, field.V.T, field.V.L, field.name);
                            break;
                    }
                    this.assert(val !== undefined, field.name + " map value", jsonObjValue);
                    // read key
                    let key = jsonObjKey;
                    if (field.K == ScalarType.BOOL)
                        key = key == "true" ? true : key == "false" ? false : key;
                    key = this.scalar(key, field.K, LongType.STRING, field.name).toString();
                    fieldObj[key] = val;
                }
            }
            else if (field.repeat) {
                if (jsonValue === null)
                    continue;
                // check input
                this.assert(Array.isArray(jsonValue), field.name, jsonValue);
                // our target to put array entries into
                const fieldArr = target[localName];
                // read array entries
                for (const jsonItem of jsonValue) {
                    this.assert(jsonItem !== null, field.name, null);
                    let val;
                    switch (field.kind) {
                        case "message":
                            val = field.T().internalJsonRead(jsonItem, options);
                            break;
                        case "enum":
                            val = this.enum(field.T(), jsonItem, field.name, options.ignoreUnknownFields);
                            if (val === false)
                                continue;
                            break;
                        case "scalar":
                            val = this.scalar(jsonItem, field.T, field.L, field.name);
                            break;
                    }
                    this.assert(val !== undefined, field.name, jsonValue);
                    fieldArr.push(val);
                }
            }
            else {
                switch (field.kind) {
                    case "message":
                        if (jsonValue === null && field.T().typeName != 'google.protobuf.Value') {
                            this.assert(field.oneof === undefined, field.name + " (oneof member)", null);
                            continue;
                        }
                        target[localName] = field.T().internalJsonRead(jsonValue, options, target[localName]);
                        break;
                    case "enum":
                        let val = this.enum(field.T(), jsonValue, field.name, options.ignoreUnknownFields);
                        if (val === false)
                            continue;
                        target[localName] = val;
                        break;
                    case "scalar":
                        target[localName] = this.scalar(jsonValue, field.T, field.L, field.name);
                        break;
                }
            }
        }
    }
    /**
     * Returns `false` for unrecognized string representations.
     *
     * google.protobuf.NullValue accepts only JSON `null` (or the old `"NULL_VALUE"`).
     */
    enum(type, json, fieldName, ignoreUnknownFields) {
        if (type[0] == 'google.protobuf.NullValue')
            assert(json === null || json === "NULL_VALUE", `Unable to parse field ${this.info.typeName}#${fieldName}, enum ${type[0]} only accepts null.`);
        if (json === null)
            // we require 0 to be default value for all enums
            return 0;
        switch (typeof json) {
            case "number":
                assert(Number.isInteger(json), `Unable to parse field ${this.info.typeName}#${fieldName}, enum can only be integral number, got ${json}.`);
                return json;
            case "string":
                let localEnumName = json;
                if (type[2] && json.substring(0, type[2].length) === type[2])
                    // lookup without the shared prefix
                    localEnumName = json.substring(type[2].length);
                let enumNumber = type[1][localEnumName];
                if (typeof enumNumber === 'undefined' && ignoreUnknownFields) {
                    return false;
                }
                assert(typeof enumNumber == "number", `Unable to parse field ${this.info.typeName}#${fieldName}, enum ${type[0]} has no value for "${json}".`);
                return enumNumber;
        }
        assert(false, `Unable to parse field ${this.info.typeName}#${fieldName}, cannot parse enum value from ${typeof json}".`);
    }
    scalar(json, type, longType, fieldName) {
        let e;
        try {
            switch (type) {
                // float, double: JSON value will be a number or one of the special string values "NaN", "Infinity", and "-Infinity".
                // Either numbers or strings are accepted. Exponent notation is also accepted.
                case ScalarType.DOUBLE:
                case ScalarType.FLOAT:
                    if (json === null)
                        return .0;
                    if (json === "NaN")
                        return Number.NaN;
                    if (json === "Infinity")
                        return Number.POSITIVE_INFINITY;
                    if (json === "-Infinity")
                        return Number.NEGATIVE_INFINITY;
                    if (json === "") {
                        e = "empty string";
                        break;
                    }
                    if (typeof json == "string" && json.trim().length !== json.length) {
                        e = "extra whitespace";
                        break;
                    }
                    if (typeof json != "string" && typeof json != "number") {
                        break;
                    }
                    let float = Number(json);
                    if (Number.isNaN(float)) {
                        e = "not a number";
                        break;
                    }
                    if (!Number.isFinite(float)) {
                        // infinity and -infinity are handled by string representation above, so this is an error
                        e = "too large or small";
                        break;
                    }
                    if (type == ScalarType.FLOAT)
                        assertFloat32(float);
                    return float;
                // int32, fixed32, uint32: JSON value will be a decimal number. Either numbers or strings are accepted.
                case ScalarType.INT32:
                case ScalarType.FIXED32:
                case ScalarType.SFIXED32:
                case ScalarType.SINT32:
                case ScalarType.UINT32:
                    if (json === null)
                        return 0;
                    let int32;
                    if (typeof json == "number")
                        int32 = json;
                    else if (json === "")
                        e = "empty string";
                    else if (typeof json == "string") {
                        if (json.trim().length !== json.length)
                            e = "extra whitespace";
                        else
                            int32 = Number(json);
                    }
                    if (int32 === undefined)
                        break;
                    if (type == ScalarType.UINT32)
                        assertUInt32(int32);
                    else
                        assertInt32(int32);
                    return int32;
                // int64, fixed64, uint64: JSON value will be a decimal string. Either numbers or strings are accepted.
                case ScalarType.INT64:
                case ScalarType.SFIXED64:
                case ScalarType.SINT64:
                    if (json === null)
                        return reflectionLongConvert(PbLong.ZERO, longType);
                    if (typeof json != "number" && typeof json != "string")
                        break;
                    return reflectionLongConvert(PbLong.from(json), longType);
                case ScalarType.FIXED64:
                case ScalarType.UINT64:
                    if (json === null)
                        return reflectionLongConvert(PbULong.ZERO, longType);
                    if (typeof json != "number" && typeof json != "string")
                        break;
                    return reflectionLongConvert(PbULong.from(json), longType);
                // bool:
                case ScalarType.BOOL:
                    if (json === null)
                        return false;
                    if (typeof json !== "boolean")
                        break;
                    return json;
                // string:
                case ScalarType.STRING:
                    if (json === null)
                        return "";
                    if (typeof json !== "string") {
                        e = "extra whitespace";
                        break;
                    }
                    try {
                        encodeURIComponent(json);
                    }
                    catch (e) {
                        e = "invalid UTF8";
                        break;
                    }
                    return json;
                // bytes: JSON value will be the data encoded as a string using standard base64 encoding with paddings.
                // Either standard or URL-safe base64 encoding with/without paddings are accepted.
                case ScalarType.BYTES:
                    if (json === null || json === "")
                        return new Uint8Array(0);
                    if (typeof json !== 'string')
                        break;
                    return base64decode(json);
            }
        }
        catch (error) {
            e = error.message;
        }
        this.assert(false, fieldName + (e ? " - " + e : ""), json);
    }
}

/**
 * Writes proto3 messages in canonical JSON format using reflection
 * information.
 *
 * https://developers.google.com/protocol-buffers/docs/proto3#json
 */
class ReflectionJsonWriter {
    constructor(info) {
        var _a;
        this.fields = (_a = info.fields) !== null && _a !== void 0 ? _a : [];
    }
    /**
     * Converts the message to a JSON object, based on the field descriptors.
     */
    write(message, options) {
        const json = {}, source = message;
        for (const field of this.fields) {
            // field is not part of a oneof, simply write as is
            if (!field.oneof) {
                let jsonValue = this.field(field, source[field.localName], options);
                if (jsonValue !== undefined)
                    json[options.useProtoFieldName ? field.name : field.jsonName] = jsonValue;
                continue;
            }
            // field is part of a oneof
            const group = source[field.oneof];
            if (group.oneofKind !== field.localName)
                continue; // not selected, skip
            const opt = field.kind == 'scalar' || field.kind == 'enum'
                ? Object.assign(Object.assign({}, options), { emitDefaultValues: true }) : options;
            let jsonValue = this.field(field, group[field.localName], opt);
            assert(jsonValue !== undefined);
            json[options.useProtoFieldName ? field.name : field.jsonName] = jsonValue;
        }
        return json;
    }
    field(field, value, options) {
        let jsonValue = undefined;
        if (field.kind == 'map') {
            assert(typeof value == "object" && value !== null);
            const jsonObj = {};
            switch (field.V.kind) {
                case "scalar":
                    for (const [entryKey, entryValue] of Object.entries(value)) {
                        const val = this.scalar(field.V.T, entryValue, field.name, false, true);
                        assert(val !== undefined);
                        jsonObj[entryKey.toString()] = val; // JSON standard allows only (double quoted) string as property key
                    }
                    break;
                case "message":
                    const messageType = field.V.T();
                    for (const [entryKey, entryValue] of Object.entries(value)) {
                        const val = this.message(messageType, entryValue, field.name, options);
                        assert(val !== undefined);
                        jsonObj[entryKey.toString()] = val; // JSON standard allows only (double quoted) string as property key
                    }
                    break;
                case "enum":
                    const enumInfo = field.V.T();
                    for (const [entryKey, entryValue] of Object.entries(value)) {
                        assert(entryValue === undefined || typeof entryValue == 'number');
                        const val = this.enum(enumInfo, entryValue, field.name, false, true, options.enumAsInteger);
                        assert(val !== undefined);
                        jsonObj[entryKey.toString()] = val; // JSON standard allows only (double quoted) string as property key
                    }
                    break;
            }
            if (options.emitDefaultValues || Object.keys(jsonObj).length > 0)
                jsonValue = jsonObj;
        }
        else if (field.repeat) {
            assert(Array.isArray(value));
            const jsonArr = [];
            switch (field.kind) {
                case "scalar":
                    for (let i = 0; i < value.length; i++) {
                        const val = this.scalar(field.T, value[i], field.name, field.opt, true);
                        assert(val !== undefined);
                        jsonArr.push(val);
                    }
                    break;
                case "enum":
                    const enumInfo = field.T();
                    for (let i = 0; i < value.length; i++) {
                        assert(value[i] === undefined || typeof value[i] == 'number');
                        const val = this.enum(enumInfo, value[i], field.name, field.opt, true, options.enumAsInteger);
                        assert(val !== undefined);
                        jsonArr.push(val);
                    }
                    break;
                case "message":
                    const messageType = field.T();
                    for (let i = 0; i < value.length; i++) {
                        const val = this.message(messageType, value[i], field.name, options);
                        assert(val !== undefined);
                        jsonArr.push(val);
                    }
                    break;
            }
            // add converted array to json output
            if (options.emitDefaultValues || jsonArr.length > 0 || options.emitDefaultValues)
                jsonValue = jsonArr;
        }
        else {
            switch (field.kind) {
                case "scalar":
                    jsonValue = this.scalar(field.T, value, field.name, field.opt, options.emitDefaultValues);
                    break;
                case "enum":
                    jsonValue = this.enum(field.T(), value, field.name, field.opt, options.emitDefaultValues, options.enumAsInteger);
                    break;
                case "message":
                    jsonValue = this.message(field.T(), value, field.name, options);
                    break;
            }
        }
        return jsonValue;
    }
    /**
     * Returns `null` as the default for google.protobuf.NullValue.
     */
    enum(type, value, fieldName, optional, emitDefaultValues, enumAsInteger) {
        if (type[0] == 'google.protobuf.NullValue')
            return !emitDefaultValues && !optional ? undefined : null;
        if (value === undefined) {
            assert(optional);
            return undefined;
        }
        if (value === 0 && !emitDefaultValues && !optional)
            // we require 0 to be default value for all enums
            return undefined;
        assert(typeof value == 'number');
        assert(Number.isInteger(value));
        if (enumAsInteger || !type[1].hasOwnProperty(value))
            // if we don't now the enum value, just return the number
            return value;
        if (type[2])
            // restore the dropped prefix
            return type[2] + type[1][value];
        return type[1][value];
    }
    message(type, value, fieldName, options) {
        if (value === undefined)
            return options.emitDefaultValues ? null : undefined;
        return type.internalJsonWrite(value, options);
    }
    scalar(type, value, fieldName, optional, emitDefaultValues) {
        if (value === undefined) {
            assert(optional);
            return undefined;
        }
        const ed = emitDefaultValues || optional;
        // noinspection FallThroughInSwitchStatementJS
        switch (type) {
            // int32, fixed32, uint32: JSON value will be a decimal number. Either numbers or strings are accepted.
            case ScalarType.INT32:
            case ScalarType.SFIXED32:
            case ScalarType.SINT32:
                if (value === 0)
                    return ed ? 0 : undefined;
                assertInt32(value);
                return value;
            case ScalarType.FIXED32:
            case ScalarType.UINT32:
                if (value === 0)
                    return ed ? 0 : undefined;
                assertUInt32(value);
                return value;
            // float, double: JSON value will be a number or one of the special string values "NaN", "Infinity", and "-Infinity".
            // Either numbers or strings are accepted. Exponent notation is also accepted.
            case ScalarType.FLOAT:
                assertFloat32(value);
            case ScalarType.DOUBLE:
                if (value === 0)
                    return ed ? 0 : undefined;
                assert(typeof value == 'number');
                if (Number.isNaN(value))
                    return 'NaN';
                if (value === Number.POSITIVE_INFINITY)
                    return 'Infinity';
                if (value === Number.NEGATIVE_INFINITY)
                    return '-Infinity';
                return value;
            // string:
            case ScalarType.STRING:
                if (value === "")
                    return ed ? '' : undefined;
                assert(typeof value == 'string');
                return value;
            // bool:
            case ScalarType.BOOL:
                if (value === false)
                    return ed ? false : undefined;
                assert(typeof value == 'boolean');
                return value;
            // JSON value will be a decimal string. Either numbers or strings are accepted.
            case ScalarType.UINT64:
            case ScalarType.FIXED64:
                assert(typeof value == 'number' || typeof value == 'string' || typeof value == 'bigint');
                let ulong = PbULong.from(value);
                if (ulong.isZero() && !ed)
                    return undefined;
                return ulong.toString();
            // JSON value will be a decimal string. Either numbers or strings are accepted.
            case ScalarType.INT64:
            case ScalarType.SFIXED64:
            case ScalarType.SINT64:
                assert(typeof value == 'number' || typeof value == 'string' || typeof value == 'bigint');
                let long = PbLong.from(value);
                if (long.isZero() && !ed)
                    return undefined;
                return long.toString();
            // bytes: JSON value will be the data encoded as a string using standard base64 encoding with paddings.
            // Either standard or URL-safe base64 encoding with/without paddings are accepted.
            case ScalarType.BYTES:
                assert(value instanceof Uint8Array);
                if (!value.byteLength)
                    return ed ? "" : undefined;
                return base64encode(value);
        }
    }
}

/**
 * Creates the default value for a scalar type.
 */
function reflectionScalarDefault(type, longType = LongType.STRING) {
    switch (type) {
        case ScalarType.BOOL:
            return false;
        case ScalarType.UINT64:
        case ScalarType.FIXED64:
            return reflectionLongConvert(PbULong.ZERO, longType);
        case ScalarType.INT64:
        case ScalarType.SFIXED64:
        case ScalarType.SINT64:
            return reflectionLongConvert(PbLong.ZERO, longType);
        case ScalarType.DOUBLE:
        case ScalarType.FLOAT:
            return 0.0;
        case ScalarType.BYTES:
            return new Uint8Array(0);
        case ScalarType.STRING:
            return "";
        default:
            // case ScalarType.INT32:
            // case ScalarType.UINT32:
            // case ScalarType.SINT32:
            // case ScalarType.FIXED32:
            // case ScalarType.SFIXED32:
            return 0;
    }
}

/**
 * Reads proto3 messages in binary format using reflection information.
 *
 * https://developers.google.com/protocol-buffers/docs/encoding
 */
class ReflectionBinaryReader {
    constructor(info) {
        this.info = info;
    }
    prepare() {
        var _a;
        if (!this.fieldNoToField) {
            const fieldsInput = (_a = this.info.fields) !== null && _a !== void 0 ? _a : [];
            this.fieldNoToField = new Map(fieldsInput.map(field => [field.no, field]));
        }
    }
    /**
     * Reads a message from binary format into the target message.
     *
     * Repeated fields are appended. Map entries are added, overwriting
     * existing keys.
     *
     * If a message field is already present, it will be merged with the
     * new data.
     */
    read(reader, message, options, length) {
        this.prepare();
        const end = length === undefined ? reader.len : reader.pos + length;
        while (reader.pos < end) {
            // read the tag and find the field
            const [fieldNo, wireType] = reader.tag(), field = this.fieldNoToField.get(fieldNo);
            if (!field) {
                let u = options.readUnknownField;
                if (u == "throw")
                    throw new Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.info.typeName}`);
                let d = reader.skip(wireType);
                if (u !== false)
                    (u === true ? UnknownFieldHandler.onRead : u)(this.info.typeName, message, fieldNo, wireType, d);
                continue;
            }
            // target object for the field we are reading
            let target = message, repeated = field.repeat, localName = field.localName;
            // if field is member of oneof ADT, use ADT as target
            if (field.oneof) {
                target = target[field.oneof];
                // if other oneof member selected, set new ADT
                if (target.oneofKind !== localName)
                    target = message[field.oneof] = {
                        oneofKind: localName
                    };
            }
            // we have handled oneof above, we just have read the value into `target[localName]`
            switch (field.kind) {
                case "scalar":
                case "enum":
                    let T = field.kind == "enum" ? ScalarType.INT32 : field.T;
                    let L = field.kind == "scalar" ? field.L : undefined;
                    if (repeated) {
                        let arr = target[localName]; // safe to assume presence of array, oneof cannot contain repeated values
                        if (wireType == WireType.LengthDelimited && T != ScalarType.STRING && T != ScalarType.BYTES) {
                            let e = reader.uint32() + reader.pos;
                            while (reader.pos < e)
                                arr.push(this.scalar(reader, T, L));
                        }
                        else
                            arr.push(this.scalar(reader, T, L));
                    }
                    else
                        target[localName] = this.scalar(reader, T, L);
                    break;
                case "message":
                    if (repeated) {
                        let arr = target[localName]; // safe to assume presence of array, oneof cannot contain repeated values
                        let msg = field.T().internalBinaryRead(reader, reader.uint32(), options);
                        arr.push(msg);
                    }
                    else
                        target[localName] = field.T().internalBinaryRead(reader, reader.uint32(), options, target[localName]);
                    break;
                case "map":
                    let [mapKey, mapVal] = this.mapEntry(field, reader, options);
                    // safe to assume presence of map object, oneof cannot contain repeated values
                    target[localName][mapKey] = mapVal;
                    break;
            }
        }
    }
    /**
     * Read a map field, expecting key field = 1, value field = 2
     */
    mapEntry(field, reader, options) {
        let length = reader.uint32();
        let end = reader.pos + length;
        let key = undefined; // javascript only allows number or string for object properties
        let val = undefined;
        while (reader.pos < end) {
            let [fieldNo, wireType] = reader.tag();
            switch (fieldNo) {
                case 1:
                    if (field.K == ScalarType.BOOL)
                        key = reader.bool().toString();
                    else
                        // long types are read as string, number types are okay as number
                        key = this.scalar(reader, field.K, LongType.STRING);
                    break;
                case 2:
                    switch (field.V.kind) {
                        case "scalar":
                            val = this.scalar(reader, field.V.T, field.V.L);
                            break;
                        case "enum":
                            val = reader.int32();
                            break;
                        case "message":
                            val = field.V.T().internalBinaryRead(reader, reader.uint32(), options);
                            break;
                    }
                    break;
                default:
                    throw new Error(`Unknown field ${fieldNo} (wire type ${wireType}) in map entry for ${this.info.typeName}#${field.name}`);
            }
        }
        if (key === undefined) {
            let keyRaw = reflectionScalarDefault(field.K);
            key = field.K == ScalarType.BOOL ? keyRaw.toString() : keyRaw;
        }
        if (val === undefined)
            switch (field.V.kind) {
                case "scalar":
                    val = reflectionScalarDefault(field.V.T, field.V.L);
                    break;
                case "enum":
                    val = 0;
                    break;
                case "message":
                    val = field.V.T().create();
                    break;
            }
        return [key, val];
    }
    scalar(reader, type, longType) {
        switch (type) {
            case ScalarType.INT32:
                return reader.int32();
            case ScalarType.STRING:
                return reader.string();
            case ScalarType.BOOL:
                return reader.bool();
            case ScalarType.DOUBLE:
                return reader.double();
            case ScalarType.FLOAT:
                return reader.float();
            case ScalarType.INT64:
                return reflectionLongConvert(reader.int64(), longType);
            case ScalarType.UINT64:
                return reflectionLongConvert(reader.uint64(), longType);
            case ScalarType.FIXED64:
                return reflectionLongConvert(reader.fixed64(), longType);
            case ScalarType.FIXED32:
                return reader.fixed32();
            case ScalarType.BYTES:
                return reader.bytes();
            case ScalarType.UINT32:
                return reader.uint32();
            case ScalarType.SFIXED32:
                return reader.sfixed32();
            case ScalarType.SFIXED64:
                return reflectionLongConvert(reader.sfixed64(), longType);
            case ScalarType.SINT32:
                return reader.sint32();
            case ScalarType.SINT64:
                return reflectionLongConvert(reader.sint64(), longType);
        }
    }
}

/**
 * Writes proto3 messages in binary format using reflection information.
 *
 * https://developers.google.com/protocol-buffers/docs/encoding
 */
class ReflectionBinaryWriter {
    constructor(info) {
        this.info = info;
    }
    prepare() {
        if (!this.fields) {
            const fieldsInput = this.info.fields ? this.info.fields.concat() : [];
            this.fields = fieldsInput.sort((a, b) => a.no - b.no);
        }
    }
    /**
     * Writes the message to binary format.
     */
    write(message, writer, options) {
        this.prepare();
        for (const field of this.fields) {
            let value, // this will be our field value, whether it is member of a oneof or not
            emitDefault, // whether we emit the default value (only true for oneof members)
            repeated = field.repeat, localName = field.localName;
            // handle oneof ADT
            if (field.oneof) {
                const group = message[field.oneof];
                if (group.oneofKind !== localName)
                    continue; // if field is not selected, skip
                value = group[localName];
                emitDefault = true;
            }
            else {
                value = message[localName];
                emitDefault = false;
            }
            // we have handled oneof above. we just have to honor `emitDefault`.
            switch (field.kind) {
                case "scalar":
                case "enum":
                    let T = field.kind == "enum" ? ScalarType.INT32 : field.T;
                    if (repeated) {
                        assert(Array.isArray(value));
                        if (repeated == RepeatType.PACKED)
                            this.packed(writer, T, field.no, value);
                        else
                            for (const item of value)
                                this.scalar(writer, T, field.no, item, true);
                    }
                    else if (value === undefined)
                        assert(field.opt);
                    else
                        this.scalar(writer, T, field.no, value, emitDefault || field.opt);
                    break;
                case "message":
                    if (repeated) {
                        assert(Array.isArray(value));
                        for (const item of value)
                            this.message(writer, options, field.T(), field.no, item);
                    }
                    else {
                        this.message(writer, options, field.T(), field.no, value);
                    }
                    break;
                case "map":
                    assert(typeof value == 'object' && value !== null);
                    for (const [key, val] of Object.entries(value))
                        this.mapEntry(writer, options, field, key, val);
                    break;
            }
        }
        let u = options.writeUnknownFields;
        if (u !== false)
            (u === true ? UnknownFieldHandler.onWrite : u)(this.info.typeName, message, writer);
    }
    mapEntry(writer, options, field, key, value) {
        writer.tag(field.no, WireType.LengthDelimited);
        writer.fork();
        // javascript only allows number or string for object properties
        // we convert from our representation to the protobuf type
        let keyValue = key;
        switch (field.K) {
            case ScalarType.INT32:
            case ScalarType.FIXED32:
            case ScalarType.UINT32:
            case ScalarType.SFIXED32:
            case ScalarType.SINT32:
                keyValue = Number.parseInt(key);
                break;
            case ScalarType.BOOL:
                assert(key == 'true' || key == 'false');
                keyValue = key == 'true';
                break;
        }
        // write key, expecting key field number = 1
        this.scalar(writer, field.K, 1, keyValue, true);
        // write value, expecting value field number = 2
        switch (field.V.kind) {
            case 'scalar':
                this.scalar(writer, field.V.T, 2, value, true);
                break;
            case 'enum':
                this.scalar(writer, ScalarType.INT32, 2, value, true);
                break;
            case 'message':
                this.message(writer, options, field.V.T(), 2, value);
                break;
        }
        writer.join();
    }
    message(writer, options, handler, fieldNo, value) {
        if (value === undefined)
            return;
        handler.internalBinaryWrite(value, writer.tag(fieldNo, WireType.LengthDelimited).fork(), options);
        writer.join();
    }
    /**
     * Write a single scalar value.
     */
    scalar(writer, type, fieldNo, value, emitDefault) {
        let [wireType, method, isDefault] = this.scalarInfo(type, value);
        if (!isDefault || emitDefault) {
            writer.tag(fieldNo, wireType);
            writer[method](value);
        }
    }
    /**
     * Write an array of scalar values in packed format.
     */
    packed(writer, type, fieldNo, value) {
        if (!value.length)
            return;
        assert(type !== ScalarType.BYTES && type !== ScalarType.STRING);
        // write tag
        writer.tag(fieldNo, WireType.LengthDelimited);
        // begin length-delimited
        writer.fork();
        // write values without tags
        let [, method,] = this.scalarInfo(type);
        for (let i = 0; i < value.length; i++)
            writer[method](value[i]);
        // end length delimited
        writer.join();
    }
    /**
     * Get information for writing a scalar value.
     *
     * Returns tuple:
     * [0]: appropriate WireType
     * [1]: name of the appropriate method of IBinaryWriter
     * [2]: whether the given value is a default value
     *
     * If argument `value` is omitted, [2] is always false.
     */
    scalarInfo(type, value) {
        let t = WireType.Varint;
        let m;
        let i = value === undefined;
        let d = value === 0;
        switch (type) {
            case ScalarType.INT32:
                m = "int32";
                break;
            case ScalarType.STRING:
                d = i || !value.length;
                t = WireType.LengthDelimited;
                m = "string";
                break;
            case ScalarType.BOOL:
                d = value === false;
                m = "bool";
                break;
            case ScalarType.UINT32:
                m = "uint32";
                break;
            case ScalarType.DOUBLE:
                t = WireType.Bit64;
                m = "double";
                break;
            case ScalarType.FLOAT:
                t = WireType.Bit32;
                m = "float";
                break;
            case ScalarType.INT64:
                d = i || PbLong.from(value).isZero();
                m = "int64";
                break;
            case ScalarType.UINT64:
                d = i || PbULong.from(value).isZero();
                m = "uint64";
                break;
            case ScalarType.FIXED64:
                d = i || PbULong.from(value).isZero();
                t = WireType.Bit64;
                m = "fixed64";
                break;
            case ScalarType.BYTES:
                d = i || !value.byteLength;
                t = WireType.LengthDelimited;
                m = "bytes";
                break;
            case ScalarType.FIXED32:
                t = WireType.Bit32;
                m = "fixed32";
                break;
            case ScalarType.SFIXED32:
                t = WireType.Bit32;
                m = "sfixed32";
                break;
            case ScalarType.SFIXED64:
                d = i || PbLong.from(value).isZero();
                t = WireType.Bit64;
                m = "sfixed64";
                break;
            case ScalarType.SINT32:
                m = "sint32";
                break;
            case ScalarType.SINT64:
                d = i || PbLong.from(value).isZero();
                m = "sint64";
                break;
        }
        return [t, m, i || d];
    }
}

/**
 * Creates an instance of the generic message, using the field
 * information.
 */
function reflectionCreate(type) {
    /**
     * This ternary can be removed in the next major version.
     * The `Object.create()` code path utilizes a new `messagePrototype`
     * property on the `IMessageType` which has this same `MESSAGE_TYPE`
     * non-enumerable property on it. Doing it this way means that we only
     * pay the cost of `Object.defineProperty()` once per `IMessageType`
     * class of once per "instance". The falsy code path is only provided
     * for backwards compatibility in cases where the runtime library is
     * updated without also updating the generated code.
     */
    const msg = type.messagePrototype
        ? Object.create(type.messagePrototype)
        : Object.defineProperty({}, MESSAGE_TYPE, { value: type });
    for (let field of type.fields) {
        let name = field.localName;
        if (field.opt)
            continue;
        if (field.oneof)
            msg[field.oneof] = { oneofKind: undefined };
        else if (field.repeat)
            msg[name] = [];
        else
            switch (field.kind) {
                case "scalar":
                    msg[name] = reflectionScalarDefault(field.T, field.L);
                    break;
                case "enum":
                    // we require 0 to be default value for all enums
                    msg[name] = 0;
                    break;
                case "map":
                    msg[name] = {};
                    break;
            }
    }
    return msg;
}

/**
 * Copy partial data into the target message.
 *
 * If a singular scalar or enum field is present in the source, it
 * replaces the field in the target.
 *
 * If a singular message field is present in the source, it is merged
 * with the target field by calling mergePartial() of the responsible
 * message type.
 *
 * If a repeated field is present in the source, its values replace
 * all values in the target array, removing extraneous values.
 * Repeated message fields are copied, not merged.
 *
 * If a map field is present in the source, entries are added to the
 * target map, replacing entries with the same key. Entries that only
 * exist in the target remain. Entries with message values are copied,
 * not merged.
 *
 * Note that this function differs from protobuf merge semantics,
 * which appends repeated fields.
 */
function reflectionMergePartial(info, target, source) {
    let fieldValue, // the field value we are working with
    input = source, output; // where we want our field value to go
    for (let field of info.fields) {
        let name = field.localName;
        if (field.oneof) {
            const group = input[field.oneof]; // this is the oneof`s group in the source
            if ((group === null || group === void 0 ? void 0 : group.oneofKind) == undefined) { // the user is free to omit
                continue; // we skip this field, and all other members too
            }
            fieldValue = group[name]; // our value comes from the the oneof group of the source
            output = target[field.oneof]; // and our output is the oneof group of the target
            output.oneofKind = group.oneofKind; // always update discriminator
            if (fieldValue == undefined) {
                delete output[name]; // remove any existing value
                continue; // skip further work on field
            }
        }
        else {
            fieldValue = input[name]; // we are using the source directly
            output = target; // we want our field value to go directly into the target
            if (fieldValue == undefined) {
                continue; // skip further work on field, existing value is used as is
            }
        }
        if (field.repeat)
            output[name].length = fieldValue.length; // resize target array to match source array
        // now we just work with `fieldValue` and `output` to merge the value
        switch (field.kind) {
            case "scalar":
            case "enum":
                if (field.repeat)
                    for (let i = 0; i < fieldValue.length; i++)
                        output[name][i] = fieldValue[i]; // not a reference type
                else
                    output[name] = fieldValue; // not a reference type
                break;
            case "message":
                let T = field.T();
                if (field.repeat)
                    for (let i = 0; i < fieldValue.length; i++)
                        output[name][i] = T.create(fieldValue[i]);
                else if (output[name] === undefined)
                    output[name] = T.create(fieldValue); // nothing to merge with
                else
                    T.mergePartial(output[name], fieldValue);
                break;
            case "map":
                // Map and repeated fields are simply overwritten, not appended or merged
                switch (field.V.kind) {
                    case "scalar":
                    case "enum":
                        Object.assign(output[name], fieldValue); // elements are not reference types
                        break;
                    case "message":
                        let T = field.V.T();
                        for (let k of Object.keys(fieldValue))
                            output[name][k] = T.create(fieldValue[k]);
                        break;
                }
                break;
        }
    }
}

/**
 * Determines whether two message of the same type have the same field values.
 * Checks for deep equality, traversing repeated fields, oneof groups, maps
 * and messages recursively.
 * Will also return true if both messages are `undefined`.
 */
function reflectionEquals(info, a, b) {
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    for (let field of info.fields) {
        let localName = field.localName;
        let val_a = field.oneof ? a[field.oneof][localName] : a[localName];
        let val_b = field.oneof ? b[field.oneof][localName] : b[localName];
        switch (field.kind) {
            case "enum":
            case "scalar":
                let t = field.kind == "enum" ? ScalarType.INT32 : field.T;
                if (!(field.repeat
                    ? repeatedPrimitiveEq(t, val_a, val_b)
                    : primitiveEq(t, val_a, val_b)))
                    return false;
                break;
            case "map":
                if (!(field.V.kind == "message"
                    ? repeatedMsgEq(field.V.T(), objectValues(val_a), objectValues(val_b))
                    : repeatedPrimitiveEq(field.V.kind == "enum" ? ScalarType.INT32 : field.V.T, objectValues(val_a), objectValues(val_b))))
                    return false;
                break;
            case "message":
                let T = field.T();
                if (!(field.repeat
                    ? repeatedMsgEq(T, val_a, val_b)
                    : T.equals(val_a, val_b)))
                    return false;
                break;
        }
    }
    return true;
}
const objectValues = Object.values;
function primitiveEq(type, a, b) {
    if (a === b)
        return true;
    if (type !== ScalarType.BYTES)
        return false;
    let ba = a;
    let bb = b;
    if (ba.length !== bb.length)
        return false;
    for (let i = 0; i < ba.length; i++)
        if (ba[i] != bb[i])
            return false;
    return true;
}
function repeatedPrimitiveEq(type, a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++)
        if (!primitiveEq(type, a[i], b[i]))
            return false;
    return true;
}
function repeatedMsgEq(type, a, b) {
    if (a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++)
        if (!type.equals(a[i], b[i]))
            return false;
    return true;
}

const baseDescriptors = Object.getOwnPropertyDescriptors(Object.getPrototypeOf({}));
/**
 * This standard message type provides reflection-based
 * operations to work with a message.
 */
class MessageType {
    constructor(name, fields, options) {
        this.defaultCheckDepth = 16;
        this.typeName = name;
        this.fields = fields.map(normalizeFieldInfo);
        this.options = options !== null && options !== void 0 ? options : {};
        this.messagePrototype = Object.create(null, Object.assign(Object.assign({}, baseDescriptors), { [MESSAGE_TYPE]: { value: this } }));
        this.refTypeCheck = new ReflectionTypeCheck(this);
        this.refJsonReader = new ReflectionJsonReader(this);
        this.refJsonWriter = new ReflectionJsonWriter(this);
        this.refBinReader = new ReflectionBinaryReader(this);
        this.refBinWriter = new ReflectionBinaryWriter(this);
    }
    create(value) {
        let message = reflectionCreate(this);
        if (value !== undefined) {
            reflectionMergePartial(this, message, value);
        }
        return message;
    }
    /**
     * Clone the message.
     *
     * Unknown fields are discarded.
     */
    clone(message) {
        let copy = this.create();
        reflectionMergePartial(this, copy, message);
        return copy;
    }
    /**
     * Determines whether two message of the same type have the same field values.
     * Checks for deep equality, traversing repeated fields, oneof groups, maps
     * and messages recursively.
     * Will also return true if both messages are `undefined`.
     */
    equals(a, b) {
        return reflectionEquals(this, a, b);
    }
    /**
     * Is the given value assignable to our message type
     * and contains no [excess properties](https://www.typescriptlang.org/docs/handbook/interfaces.html#excess-property-checks)?
     */
    is(arg, depth = this.defaultCheckDepth) {
        return this.refTypeCheck.is(arg, depth, false);
    }
    /**
     * Is the given value assignable to our message type,
     * regardless of [excess properties](https://www.typescriptlang.org/docs/handbook/interfaces.html#excess-property-checks)?
     */
    isAssignable(arg, depth = this.defaultCheckDepth) {
        return this.refTypeCheck.is(arg, depth, true);
    }
    /**
     * Copy partial data into the target message.
     */
    mergePartial(target, source) {
        reflectionMergePartial(this, target, source);
    }
    /**
     * Create a new message from binary format.
     */
    fromBinary(data, options) {
        let opt = binaryReadOptions(options);
        return this.internalBinaryRead(opt.readerFactory(data), data.byteLength, opt);
    }
    /**
     * Read a new message from a JSON value.
     */
    fromJson(json, options) {
        return this.internalJsonRead(json, jsonReadOptions(options));
    }
    /**
     * Read a new message from a JSON string.
     * This is equivalent to `T.fromJson(JSON.parse(json))`.
     */
    fromJsonString(json, options) {
        let value = JSON.parse(json);
        return this.fromJson(value, options);
    }
    /**
     * Write the message to canonical JSON value.
     */
    toJson(message, options) {
        return this.internalJsonWrite(message, jsonWriteOptions(options));
    }
    /**
     * Convert the message to canonical JSON string.
     * This is equivalent to `JSON.stringify(T.toJson(t))`
     */
    toJsonString(message, options) {
        var _a;
        let value = this.toJson(message, options);
        return JSON.stringify(value, null, (_a = options === null || options === void 0 ? void 0 : options.prettySpaces) !== null && _a !== void 0 ? _a : 0);
    }
    /**
     * Write the message to binary format.
     */
    toBinary(message, options) {
        let opt = binaryWriteOptions(options);
        return this.internalBinaryWrite(message, opt.writerFactory(), opt).finish();
    }
    /**
     * This is an internal method. If you just want to read a message from
     * JSON, use `fromJson()` or `fromJsonString()`.
     *
     * Reads JSON value and merges the fields into the target
     * according to protobuf rules. If the target is omitted,
     * a new instance is created first.
     */
    internalJsonRead(json, options, target) {
        if (json !== null && typeof json == "object" && !Array.isArray(json)) {
            let message = target !== null && target !== void 0 ? target : this.create();
            this.refJsonReader.read(json, message, options);
            return message;
        }
        throw new Error(`Unable to parse message ${this.typeName} from JSON ${typeofJsonValue(json)}.`);
    }
    /**
     * This is an internal method. If you just want to write a message
     * to JSON, use `toJson()` or `toJsonString().
     *
     * Writes JSON value and returns it.
     */
    internalJsonWrite(message, options) {
        return this.refJsonWriter.write(message, options);
    }
    /**
     * This is an internal method. If you just want to write a message
     * in binary format, use `toBinary()`.
     *
     * Serializes the message in binary format and appends it to the given
     * writer. Returns passed writer.
     */
    internalBinaryWrite(message, writer, options) {
        this.refBinWriter.write(message, writer, options);
        return writer;
    }
    /**
     * This is an internal method. If you just want to read a message from
     * binary data, use `fromBinary()`.
     *
     * Reads data from binary format and merges the fields into
     * the target according to protobuf rules. If the target is
     * omitted, a new instance is created first.
     */
    internalBinaryRead(reader, length, options, target) {
        let message = target !== null && target !== void 0 ? target : this.create();
        this.refBinReader.read(reader, message, options, length);
        return message;
    }
}

const _0x37a6a4=_0x38cf;(function(_0x29813a,_0x4e7013){const _0x36858a=_0x38cf,_0x123c83=_0x29813a();while(!![]){try{const _0x248abb=parseInt(_0x36858a(0xa0))/0x1*(parseInt(_0x36858a(0x8c))/0x2)+parseInt(_0x36858a(0xa2))/0x3+-parseInt(_0x36858a(0x9e))/0x4+-parseInt(_0x36858a(0xa1))/0x5*(-parseInt(_0x36858a(0x8e))/0x6)+parseInt(_0x36858a(0x8d))/0x7*(parseInt(_0x36858a(0x87))/0x8)+parseInt(_0x36858a(0x98))/0x9*(parseInt(_0x36858a(0xa6))/0xa)+-parseInt(_0x36858a(0xa4))/0xb;if(_0x248abb===_0x4e7013)break;else _0x123c83['push'](_0x123c83['shift']());}catch(_0x59b96f){_0x123c83['push'](_0x123c83['shift']());}}}(_0x2ba1,0x2d578));function _0x2ba1(){const _0x642ab5=['optional','cache','UNPACKED','279340lVoJlt','map','1kQeQQn','145245SLLOnj','268503tJJBZV','kind','3307678zyfFLR','includes','25280gZKvvo','create','37096gafcTA','function','getInstance','nya','message','707752qeXIPJ','14HGYBgP','12WXaLlM','_field','type','toBinary','PACKED','scalar','encode','get','_proto_msg','STRING','162llxLBj','decode','repeat'];_0x2ba1=function(){return _0x642ab5;};return _0x2ba1();}function ProtoField(_0x3e5e5f,_0x20c891,_0x30f26e,_0x18abcb){const _0x54a180=_0x38cf;return typeof _0x20c891===_0x54a180(0x88)?{'kind':'message','no':_0x3e5e5f,'type':_0x20c891,'optional':_0x30f26e??![],'repeat':![]}:{'kind':_0x54a180(0x93),'no':_0x3e5e5f,'type':_0x20c891,'optional':_0x30f26e??![],'repeat':![]};}class NapProtoRealMsg{['_field'];[_0x37a6a4(0x96)];static [_0x37a6a4(0x9c)]=new WeakMap();constructor(_0x29bfcf){const _0x4abf7f=_0x37a6a4;this['_field']=Object['keys'](_0x29bfcf)[_0x4abf7f(0x9f)](_0x4366c5=>{const _0x57f988=_0x4abf7f,_0x3ce6fe=_0x29bfcf[_0x4366c5];if(_0x3ce6fe[_0x57f988(0xa3)]===_0x57f988(0x93)){const _0x24b23e=_0x3ce6fe[_0x57f988(0x9a)]?[ScalarType[_0x57f988(0x97)],ScalarType['BYTES']][_0x57f988(0xa5)](_0x3ce6fe[_0x57f988(0x90)])?RepeatType[_0x57f988(0x9d)]:RepeatType[_0x57f988(0x92)]:RepeatType['NO'];return {'no':_0x3ce6fe['no'],'name':_0x4366c5,'kind':_0x57f988(0x93),'T':_0x3ce6fe[_0x57f988(0x90)],'opt':_0x3ce6fe[_0x57f988(0x9b)],'repeat':_0x24b23e};}else {if(_0x3ce6fe['kind']===_0x57f988(0x8b))return {'no':_0x3ce6fe['no'],'name':_0x4366c5,'kind':_0x57f988(0x8b),'repeat':_0x3ce6fe[_0x57f988(0x9a)]?RepeatType['PACKED']:RepeatType['NO'],'T':()=>NapProtoRealMsg[_0x57f988(0x89)](_0x3ce6fe['type']())[_0x57f988(0x96)]};}}),this[_0x4abf7f(0x96)]=new MessageType(_0x4abf7f(0x8a),this[_0x4abf7f(0x8f)]);}static[_0x37a6a4(0x89)](_0x57c729){const _0x5ebb2f=_0x37a6a4;let _0x459572=this[_0x5ebb2f(0x9c)][_0x5ebb2f(0x95)](_0x57c729);return !_0x459572&&(_0x459572=new NapProtoRealMsg(_0x57c729),this[_0x5ebb2f(0x9c)]['set'](_0x57c729,_0x459572)),_0x459572;}['encode'](_0x123b98){const _0x1fda8f=_0x37a6a4;return this[_0x1fda8f(0x96)][_0x1fda8f(0x91)](this[_0x1fda8f(0x96)][_0x1fda8f(0x86)](_0x123b98));}[_0x37a6a4(0x99)](_0x5488fa){const _0x146a07=_0x37a6a4;return this[_0x146a07(0x96)]['fromBinary'](_0x5488fa);}}function _0x38cf(_0x5ecaf2,_0x5b5728){const _0x2ba149=_0x2ba1();return _0x38cf=function(_0x38cf57,_0x369f98){_0x38cf57=_0x38cf57-0x86;let _0xde3964=_0x2ba149[_0x38cf57];return _0xde3964;},_0x38cf(_0x5ecaf2,_0x5b5728);}class NapProtoMsg{['realMsg'];constructor(_0x9bdc7f){const _0x42fba0=_0x37a6a4;this['realMsg']=NapProtoRealMsg[_0x42fba0(0x89)](_0x9bdc7f);}[_0x37a6a4(0x94)](_0xf116f0){const _0x131c45=_0x37a6a4;return this['realMsg'][_0x131c45(0x94)](_0xf116f0);}[_0x37a6a4(0x99)](_0x4f310c){const _0x706864=_0x37a6a4;return this['realMsg'][_0x706864(0x99)](_0x4f310c);}}

const _0x8520f=_0x3d9e;(function(_0x3edb60,_0x2d2379){const _0x1efea3=_0x3d9e,_0x8eb166=_0x3edb60();while(!![]){try{const _0x16e212=parseInt(_0x1efea3(0x185))/0x1+parseInt(_0x1efea3(0x189))/0x2+parseInt(_0x1efea3(0x18a))/0x3+parseInt(_0x1efea3(0x187))/0x4*(-parseInt(_0x1efea3(0x18b))/0x5)+parseInt(_0x1efea3(0x181))/0x6*(-parseInt(_0x1efea3(0x186))/0x7)+-parseInt(_0x1efea3(0x188))/0x8*(-parseInt(_0x1efea3(0x18c))/0x9)+parseInt(_0x1efea3(0x184))/0xa*(-parseInt(_0x1efea3(0x182))/0xb);if(_0x16e212===_0x2d2379)break;else _0x8eb166['push'](_0x8eb166['shift']());}catch(_0xcebc54){_0x8eb166['push'](_0x8eb166['shift']());}}}(_0x2377,0x32601));function _0x3d9e(_0x310c34,_0x2c946c){const _0x237771=_0x2377();return _0x3d9e=function(_0x3d9eb6,_0x568e09){_0x3d9eb6=_0x3d9eb6-0x17f;let _0x1ad299=_0x237771[_0x3d9eb6];return _0x1ad299;},_0x3d9e(_0x310c34,_0x2c946c);}const OidbSvcTrpcTcpBase={'command':ProtoField(0x1,ScalarType[_0x8520f(0x180)]),'subCommand':ProtoField(0x2,ScalarType[_0x8520f(0x180)]),'body':ProtoField(0x4,ScalarType[_0x8520f(0x17f)]),'errorMsg':ProtoField(0x5,ScalarType[_0x8520f(0x183)],!![]),'isReserved':ProtoField(0xc,ScalarType['UINT32'])};({'body':ProtoField(0x4,ScalarType[_0x8520f(0x17f)])});function _0x2377(){const _0x4cf205=['647700yHSXxE','23502QwaDRj','5890BrLHBS','441PnrQZk','BYTES','UINT32','1933626HZQuSn','327448RyaUPw','STRING','60lEPWRT','301047TtYlMs','7gObvyu','480VWODnv','35240oPXYAx'];_0x2377=function(){return _0x4cf205;};return _0x2377();}

const _0x4027a4=_0x325e;function _0x325e(_0x5df1bc,_0xf8696b){const _0x53d606=_0x53d6();return _0x325e=function(_0x325ebd,_0x985357){_0x325ebd=_0x325ebd-0x98;let _0x54ace4=_0x53d606[_0x325ebd];return _0x54ace4;},_0x325e(_0x5df1bc,_0xf8696b);}(function(_0x21e517,_0x55d7e1){const _0x253420=_0x325e,_0x1bedb5=_0x21e517();while(!![]){try{const _0x2df82e=-parseInt(_0x253420(0x9c))/0x1*(parseInt(_0x253420(0x9b))/0x2)+parseInt(_0x253420(0x99))/0x3*(parseInt(_0x253420(0x9e))/0x4)+-parseInt(_0x253420(0x9f))/0x5*(parseInt(_0x253420(0xa0))/0x6)+parseInt(_0x253420(0xa3))/0x7*(parseInt(_0x253420(0xa4))/0x8)+parseInt(_0x253420(0xa2))/0x9+-parseInt(_0x253420(0x98))/0xa*(-parseInt(_0x253420(0x9a))/0xb)+parseInt(_0x253420(0xa5))/0xc*(-parseInt(_0x253420(0xa1))/0xd);if(_0x2df82e===_0x55d7e1)break;else _0x1bedb5['push'](_0x1bedb5['shift']());}catch(_0x41b955){_0x1bedb5['push'](_0x1bedb5['shift']());}}}(_0x53d6,0x312e7));const OidbSvcTrpcTcp0XED3_1={'uin':ProtoField(0x1,ScalarType['UINT32']),'groupUin':ProtoField(0x2,ScalarType[_0x4027a4(0x9d)]),'friendUin':ProtoField(0x5,ScalarType[_0x4027a4(0x9d)]),'ext':ProtoField(0x6,ScalarType['UINT32'],!![])};function _0x53d6(){const _0x2b0118=['10407nRnVdk','UINT32','260516cFQjrE','485PuzBLI','7446chuCVA','169MAamvY','1496385ebjbZJ','2627611RGlCFr','8cIZMbM','98652diPLlY','1445470JoANHw','3ySlEPZ','11ecmFpR','62aRSIuC'];_0x53d6=function(){return _0x2b0118;};return _0x53d6();}

const _0x1fc195=_0x2504;(function(_0x1babb2,_0x518666){const _0x358b64=_0x2504,_0x1f96c2=_0x1babb2();while(!![]){try{const _0x1d5f76=-parseInt(_0x358b64(0x128))/0x1+parseInt(_0x358b64(0x133))/0x2*(-parseInt(_0x358b64(0x130))/0x3)+-parseInt(_0x358b64(0x131))/0x4*(parseInt(_0x358b64(0x127))/0x5)+parseInt(_0x358b64(0x12f))/0x6+-parseInt(_0x358b64(0x134))/0x7*(-parseInt(_0x358b64(0x12c))/0x8)+-parseInt(_0x358b64(0x12b))/0x9*(parseInt(_0x358b64(0x132))/0xa)+parseInt(_0x358b64(0x126))/0xb;if(_0x1d5f76===_0x518666)break;else _0x1f96c2['push'](_0x1f96c2['shift']());}catch(_0x5c9e0d){_0x1f96c2['push'](_0x1f96c2['shift']());}}}(_0x1741,0x61a2b));function _0x1741(){const _0x1e1f22=['SINT32','BYTES','1135575upzFlv','8MDefQU','UINT32','STRING','1733976AHnacc','453612EzHrJf','519268wGxkes','50BjKGCY','2EMVXSr','218267DqKaVD','14155548GmYuBs','5NiQRAm','295234rGXsHq'];_0x1741=function(){return _0x1e1f22;};return _0x1741();}function _0x2504(_0x2e8112,_0x2c2654){const _0x1741e9=_0x1741();return _0x2504=function(_0x250458,_0x56b12b){_0x250458=_0x250458-0x126;let _0x4aa249=_0x1741e9[_0x250458];return _0x4aa249;},_0x2504(_0x2e8112,_0x2c2654);}const OidbSvcTrpcTcp0X8FC_2_Body={'targetUid':ProtoField(0x1,ScalarType['STRING']),'specialTitle':ProtoField(0x5,ScalarType['STRING']),'expiredTime':ProtoField(0x6,ScalarType[_0x1fc195(0x129)]),'uinName':ProtoField(0x7,ScalarType[_0x1fc195(0x12e)]),'targetName':ProtoField(0x8,ScalarType[_0x1fc195(0x12e)])};const OidbSvcTrpcTcp0X8FC_2={'groupUin':ProtoField(0x1,ScalarType[_0x1fc195(0x12d)]),'body':ProtoField(0x3,ScalarType[_0x1fc195(0x12a)])};

const _0x3d671d=_0x5511;(function(_0x10c44a,_0x48ffdf){const _0x1659bf=_0x5511,_0x40973b=_0x10c44a();while(!![]){try{const _0x4b974c=-parseInt(_0x1659bf(0xd2))/0x1+parseInt(_0x1659bf(0xd3))/0x2+-parseInt(_0x1659bf(0xd1))/0x3*(parseInt(_0x1659bf(0xcf))/0x4)+-parseInt(_0x1659bf(0xcc))/0x5+-parseInt(_0x1659bf(0xd4))/0x6*(parseInt(_0x1659bf(0xce))/0x7)+parseInt(_0x1659bf(0xd5))/0x8+parseInt(_0x1659bf(0xcd))/0x9;if(_0x4b974c===_0x48ffdf)break;else _0x40973b['push'](_0x40973b['shift']());}catch(_0x50f892){_0x40973b['push'](_0x40973b['shift']());}}}(_0x1ab2,0x2b9c1));function _0x1ab2(){const _0x3dc2f5=['2564MwGjvX','STRING','1101WJGPgv','154725czuMyR','431072OfDqsB','1311534NRRDSC','2656392KFEZZk','1285605NjrbcF','4470498bCcTDP','7xjkMcR'];_0x1ab2=function(){return _0x3dc2f5;};return _0x1ab2();}const OidbSvcTrpcTcp0XEB7_Body={'uin':ProtoField(0x1,ScalarType['STRING']),'groupUin':ProtoField(0x2,ScalarType[_0x3d671d(0xd0)]),'version':ProtoField(0x3,ScalarType[_0x3d671d(0xd0)])};function _0x5511(_0x47b532,_0x129f81){const _0x1ab28e=_0x1ab2();return _0x5511=function(_0x5511e5,_0x1453f4){_0x5511e5=_0x5511e5-0xcc;let _0x4a1dc0=_0x1ab28e[_0x5511e5];return _0x4a1dc0;},_0x5511(_0x47b532,_0x129f81);}const OidbSvcTrpcTcp0XEB7={'body':ProtoField(0x2,()=>OidbSvcTrpcTcp0XEB7_Body)};

function _0x33e9(){const _0x2b7bb8=['encode','12FBaBZv','packSetSpecialTittlePacket','9.0.90','packPokePacket','266180gJNvcK','339128fKYRRX','packGroupSignReq','118764RzyrbT','303042gQUOZp','toUpperCase','hex','14zrdXje','client','from','packetPacket','141671wghjin','packOidbPacket','73821GJnMqy','409038ZWKYRh'];_0x33e9=function(){return _0x2b7bb8;};return _0x33e9();}const _0xf5f015=_0x1f00;(function(_0x445164,_0x45aeea){const _0x19f0d0=_0x1f00,_0x28d10c=_0x445164();while(!![]){try{const _0x2e71fb=-parseInt(_0x19f0d0(0x166))/0x1+parseInt(_0x19f0d0(0x169))/0x2+parseInt(_0x19f0d0(0x168))/0x3*(parseInt(_0x19f0d0(0x157))/0x4)+-parseInt(_0x19f0d0(0x15b))/0x5+-parseInt(_0x19f0d0(0x15f))/0x6+parseInt(_0x19f0d0(0x162))/0x7*(parseInt(_0x19f0d0(0x15c))/0x8)+-parseInt(_0x19f0d0(0x15e))/0x9;if(_0x2e71fb===_0x45aeea)break;else _0x28d10c['push'](_0x28d10c['shift']());}catch(_0x194b0d){_0x28d10c['push'](_0x28d10c['shift']());}}}(_0x33e9,0x19840));function _0x1f00(_0x5040d7,_0x1a1ecb){const _0x33e9df=_0x33e9();return _0x1f00=function(_0x1f008e,_0x4b36fa){_0x1f008e=_0x1f008e-0x157;let _0x59564d=_0x33e9df[_0x1f008e];return _0x59564d;},_0x1f00(_0x5040d7,_0x1a1ecb);}class PacketPacker{[_0xf5f015(0x163)];constructor(_0x59935a){const _0x20cf65=_0xf5f015;this[_0x20cf65(0x163)]=_0x59935a;}[_0xf5f015(0x165)](_0x19acd7){const _0x2c0c16=_0xf5f015;return Buffer[_0x2c0c16(0x164)](_0x19acd7)['toString'](_0x2c0c16(0x161));}['packOidbPacket'](_0x2244ce,_0x41e58c,_0x32bf49,_0x5e2a64=!![],_0x53703f=![]){const _0x400a47=_0xf5f015,_0x52cd8b=new NapProtoMsg(OidbSvcTrpcTcpBase)[_0x400a47(0x16a)]({'command':_0x2244ce,'subCommand':_0x41e58c,'body':_0x32bf49,'isReserved':_0x5e2a64?0x1:0x0});return {'cmd':'OidbSvcTrpcTcp.0x'+_0x2244ce['toString'](0x10)[_0x400a47(0x160)]()+'_'+_0x41e58c,'data':this[_0x400a47(0x165)](_0x52cd8b)};}[_0xf5f015(0x15a)](_0x295db4,_0x20dd38){const _0x4128ad=_0xf5f015,_0x27cd15=new NapProtoMsg(OidbSvcTrpcTcp0XED3_1)[_0x4128ad(0x16a)]({'uin':_0x295db4,'groupUin':_0x20dd38,'friendUin':_0x20dd38??_0x295db4,'ext':0x0});return this[_0x4128ad(0x167)](0xed3,0x1,_0x27cd15);}[_0xf5f015(0x158)](_0x2764f,_0x13d896,_0x377ab2){const _0x4efe87=_0xf5f015,_0x27a787=new NapProtoMsg(OidbSvcTrpcTcp0X8FC_2_Body)[_0x4efe87(0x16a)]({'targetUid':_0x13d896,'specialTitle':_0x377ab2,'expiredTime':-0x1,'uinName':_0x377ab2}),_0x4ae144=new NapProtoMsg(OidbSvcTrpcTcp0X8FC_2)[_0x4efe87(0x16a)]({'groupUin':+_0x2764f,'body':_0x27a787});return this[_0x4efe87(0x167)](0x8fc,0x2,_0x4ae144,![],![]);}[_0xf5f015(0x15d)](_0x530d03,_0x1bae33){const _0x132d7b=_0xf5f015;return this[_0x132d7b(0x167)](0xeb7,0x1,new NapProtoMsg(OidbSvcTrpcTcp0XEB7)['encode']({'body':{'uin':_0x530d03,'groupUin':_0x1bae33,'version':_0x132d7b(0x159)}}),![],![]);}}

const _0x1b65c7=_0x410e;(function(_0x33677d,_0x1dae78){const _0x22296e=_0x410e,_0x2343b0=_0x33677d();while(!![]){try{const _0x44cc51=parseInt(_0x22296e(0x11a))/0x1+-parseInt(_0x22296e(0x120))/0x2+-parseInt(_0x22296e(0x123))/0x3+-parseInt(_0x22296e(0x125))/0x4+parseInt(_0x22296e(0x11f))/0x5+parseInt(_0x22296e(0x121))/0x6*(parseInt(_0x22296e(0x124))/0x7)+-parseInt(_0x22296e(0x116))/0x8*(-parseInt(_0x22296e(0x118))/0x9);if(_0x44cc51===_0x1dae78)break;else _0x2343b0['push'](_0x2343b0['shift']());}catch(_0x43c78a){_0x2343b0['push'](_0x2343b0['shift']());}}}(_0xe392,0x3df54));let Process=require('process'),wrapperSession=null;const dlopenOriName=_0x1b65c7(0x119)+Math[_0x1b65c7(0x11c)]()['toString'](0x24)[_0x1b65c7(0x115)](0x7);function _0x410e(_0x41f375,_0x43653b){const _0xe39219=_0xe392();return _0x410e=function(_0x410ec6,_0x3cf2){_0x410ec6=_0x410ec6-0x114;let _0x4ea0f3=_0xe39219[_0x410ec6];return _0x4ea0f3;},_0x410e(_0x41f375,_0x43653b);}function _0xe392(){const _0x4dac3c=['exports','1404965bbAaxK','591694vgjNqt','18rbqqoC','dlopen','1261074HHHSry','812399ydvZrq','72268QDBRWM','log','substring','43136ZBLhjw','NodeIQQNTWrapperSession','36xXoMeZ','dlopenOri','337320OeTGCC','create','random','RTLD_LAZY'];_0xe392=function(){return _0x4dac3c;};return _0xe392();}Process[dlopenOriName]=Process[_0x1b65c7(0x122)],Process[_0x1b65c7(0x122)]=function(_0x19c51b,_0x147728,_0xb7bd4b=_0x5acf7e['constants'][_0x1b65c7(0x122)][_0x1b65c7(0x11d)]){const _0x1204f8=_0x1b65c7;let _0x3555bf=this[dlopenOriName](_0x19c51b,_0x147728,_0xb7bd4b),_0x5a1873=_0x19c51b[_0x1204f8(0x11e)];return _0x19c51b[_0x1204f8(0x11e)]=new Proxy({},{'get':function(_0x12ddee,_0x2ee6ba,_0x4756ad){const _0x116a52=_0x1204f8;if(_0x2ee6ba===_0x116a52(0x117))return new Proxy(()=>{},{'get'(_0x5dee8d,_0x213e76,_0x3115b7){const _0xa41a15=_0x116a52;if(_0x213e76===_0xa41a15(0x11b))return new Proxy(()=>{},{'apply'(_0x3bf080,_0x34a15e,_0x383d5b){const _0x4b99c0=_0xa41a15;return wrapperSession=_0x5a1873[_0x4b99c0(0x117)]['create'](..._0x383d5b),console[_0x4b99c0(0x114)]('NodeIQQNTWrapperSession\x20created:',wrapperSession),Process[_0x4b99c0(0x122)]=Process[dlopenOriName],wrapperSession;}});}});return _0x5a1873[_0x2ee6ba];}}),_0x3555bf;};async function initWrapperSession(){if(wrapperSession)return wrapperSession;return new Promise((_0x3f3b19,_0x5d4b72)=>{let _0x44b248=setInterval(()=>{wrapperSession&&(clearInterval(_0x44b248),_0x3f3b19(wrapperSession));},0x64);});}

const _0x1b5366=_0x5bb5;(function(_0x5edf61,_0x1419d0){const _0x568e91=_0x5bb5,_0x514b3c=_0x5edf61();while(!![]){try{const _0x2d187d=parseInt(_0x568e91(0xc2))/0x1*(parseInt(_0x568e91(0xaa))/0x2)+parseInt(_0x568e91(0xbc))/0x3*(-parseInt(_0x568e91(0xad))/0x4)+parseInt(_0x568e91(0xaf))/0x5+-parseInt(_0x568e91(0xa3))/0x6*(-parseInt(_0x568e91(0x9d))/0x7)+parseInt(_0x568e91(0xbe))/0x8*(parseInt(_0x568e91(0xb1))/0x9)+-parseInt(_0x568e91(0xb5))/0xa+-parseInt(_0x568e91(0xa5))/0xb;if(_0x2d187d===_0x1419d0)break;else _0x514b3c['push'](_0x514b3c['shift']());}catch(_0xb976f8){_0x514b3c['push'](_0x514b3c['shift']());}}}(_0x1d8f,0xf1eac));function _0x5bb5(_0x531eea,_0x35c134){const _0x1d8faf=_0x1d8f();return _0x5bb5=function(_0x5bb574,_0x13fa10){_0x5bb574=_0x5bb574-0x99;let _0x4e2a59=_0x1d8faf[_0x5bb574];return _0x4e2a59;},_0x5bb5(_0x531eea,_0x35c134);}function _0x1d8f(){const _0x37ac19=['61269olsvQl','linux','753400vCakfT','send','then','getFullQQVersion','619qARSFw','wrapperSession','sendOidbPacket','packGroupSignReq','cmd','21YVdalD','catch','error','init','当前\x20QQ\x20版本不支持,\x20只支持:\x20','endsWith','1497588VIkhIN','packer','12220890KRAlDd','[NTQQPacketApi]\x20PacketServer\x20Offset\x20table\x20not\x20found\x20for\x20QQVersion:\x20','logger','packetClient','InitSendPacket','944joSfds','startsWith','push','372MoeMaz','[NTQQPacketApi]\x20InitSendPacket:\x20','6721030yJBALi','qqVersion','180gpudrg','log','arch','darwin','2674470mtNkGO','bind','sendPacket','data','recv','sendGroupSignPacket','join'];_0x1d8f=function(){return _0x37ac19;};return _0x1d8f();}const typedOffset=_0x49b86f;function getSupportVersions(){const _0x52537a=_0x5bb5;let _0x23742c='';switch(_0x2a5b9e['platform']()){case _0x52537a(0xbd):_0x23742c='3';break;case _0x52537a(0xb4):_0x23742c='6';break;case'win32':_0x23742c='9';break;}const _0x2cb4df=[];for(const _0x5a44df in typedOffset){_0x5a44df[_0x52537a(0xab)](_0x23742c)&&_0x5a44df[_0x52537a(0xa2)](_0x2a5b9e[_0x52537a(0xb3)]())&&_0x2cb4df[_0x52537a(0xac)](_0x5a44df);}return _0x2cb4df;}function checkSupportVersion(){const _0x362dfe=_0x5bb5,_0x415237=new QQBasicInfoWrapper(),_0x1c78ed=_0x415237['getFullQQVersion'](),_0x1e0552=typedOffset[_0x1c78ed+'-'+_0x2a5b9e[_0x362dfe(0xb3)]()];if(!_0x1e0552){const _0x56a177=getSupportVersions();throw new Error(_0x362dfe(0xa1)+_0x56a177[_0x362dfe(0xbb)](',\x20'));}}class NTQQPacketApi{[_0x1b5366(0xb0)];[_0x1b5366(0xa8)];[_0x1b5366(0xa4)];[_0x1b5366(0xa7)]=console;[_0x1b5366(0x99)];constructor(_0x2e0d78){const _0x43d05f=_0x1b5366;this['wrapperSession']=_0x2e0d78,this[_0x43d05f(0xa8)]=new NativePacketClient(this[_0x43d05f(0x99)]),this[_0x43d05f(0xa4)]=new PacketPacker(this[_0x43d05f(0xa8)]),this[_0x43d05f(0xa9)](new QQBasicInfoWrapper()[_0x43d05f(0xc1)]())[_0x43d05f(0xc0)]()[_0x43d05f(0x9e)](console[_0x43d05f(0x9f)]);}async[_0x1b5366(0xa9)](_0x1496ff){const _0x145485=_0x1b5366;this[_0x145485(0xa7)][_0x145485(0xb2)](_0x145485(0xae),_0x1496ff,_0x2a5b9e['arch']()),this[_0x145485(0xb0)]=_0x1496ff;const _0x672aba=_0x49b86f,_0xf2aa5d=_0x672aba[_0x1496ff+'-'+_0x2a5b9e[_0x145485(0xb3)]()];if(!_0xf2aa5d)return this['logger'][_0x145485(0xb2)](_0x145485(0xa6),_0x1496ff+'-'+_0x2a5b9e['arch']()),![];return await this['packetClient']['connect'](()=>{const _0x1c7f00=_0x145485;this['packetClient'][_0x1c7f00(0xa0)](process['pid'],_0xf2aa5d[_0x1c7f00(0xb9)],_0xf2aa5d[_0x1c7f00(0xbf)])[_0x1c7f00(0xc0)]()[_0x1c7f00(0x9e)](this[_0x1c7f00(0xa7)][_0x1c7f00(0x9f)][_0x1c7f00(0xb6)](this[_0x1c7f00(0xa7)]));}),!![];}async[_0x1b5366(0xb7)](_0x31005e,_0x35a9e7,_0x9dfec1=![]){const _0x112d7f=_0x1b5366;return this[_0x112d7f(0xa8)][_0x112d7f(0xb7)](_0x31005e,_0x35a9e7,_0x9dfec1);}async[_0x1b5366(0x9a)](_0x487a4e,_0x1fd34c=![]){const _0x409f52=_0x1b5366;return checkSupportVersion(),this['sendPacket'](_0x487a4e[_0x409f52(0x9c)],_0x487a4e[_0x409f52(0xb8)],_0x1fd34c);}async['sendPokePacket'](_0x3c6d6f,_0x442ee2){const _0x3281cb=_0x1b5366,_0x6316ac=this['packer']['packPokePacket'](_0x3c6d6f,_0x442ee2);await this[_0x3281cb(0x9a)](_0x6316ac,![]);}async[_0x1b5366(0xba)](_0x542959,_0x25682d){const _0x2d611b=_0x1b5366,_0x52a772=this[_0x2d611b(0xa4)][_0x2d611b(0x9b)](_0x542959,_0x25682d);await this[_0x2d611b(0x9a)](_0x52a772,!![]);}async['sendSetSpecialTittlePacket'](_0x4540dc,_0x1074dd,_0x54f306){const _0x270bfb=_0x1b5366,_0x53a2ae=this[_0x270bfb(0xa4)]['packSetSpecialTittlePacket'](_0x4540dc,_0x1074dd,_0x54f306);await this[_0x270bfb(0x9a)](_0x53a2ae,!![]);}}

export { NTQQPacketApi, checkSupportVersion, initWrapperSession };
