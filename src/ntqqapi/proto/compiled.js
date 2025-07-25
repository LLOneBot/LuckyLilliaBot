/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
import $protobuf from "protobufjs/minimal";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const SysMsg = $root.SysMsg = (() => {

    /**
     * Namespace SysMsg.
     * @exports SysMsg
     * @namespace
     */
    const SysMsg = {};

    SysMsg.LikeDetail = (function() {

        /**
         * Properties of a LikeDetail.
         * @memberof SysMsg
         * @interface ILikeDetail
         * @property {string|null} [txt] LikeDetail txt
         * @property {number|null} [uin] LikeDetail uin
         * @property {string|null} [nickname] LikeDetail nickname
         */

        /**
         * Constructs a new LikeDetail.
         * @memberof SysMsg
         * @classdesc Represents a LikeDetail.
         * @implements ILikeDetail
         * @constructor
         * @param {SysMsg.ILikeDetail=} [properties] Properties to set
         */
        function LikeDetail(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * LikeDetail txt.
         * @member {string} txt
         * @memberof SysMsg.LikeDetail
         * @instance
         */
        LikeDetail.prototype.txt = "";

        /**
         * LikeDetail uin.
         * @member {number} uin
         * @memberof SysMsg.LikeDetail
         * @instance
         */
        LikeDetail.prototype.uin = 0;

        /**
         * LikeDetail nickname.
         * @member {string} nickname
         * @memberof SysMsg.LikeDetail
         * @instance
         */
        LikeDetail.prototype.nickname = "";

        /**
         * Encodes the specified LikeDetail message. Does not implicitly {@link SysMsg.LikeDetail.verify|verify} messages.
         * @function encode
         * @memberof SysMsg.LikeDetail
         * @static
         * @param {SysMsg.ILikeDetail} message LikeDetail message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LikeDetail.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.txt != null && Object.hasOwnProperty.call(message, "txt"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.txt);
            if (message.uin != null && Object.hasOwnProperty.call(message, "uin"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.uin);
            if (message.nickname != null && Object.hasOwnProperty.call(message, "nickname"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.nickname);
            return writer;
        };

        /**
         * Decodes a LikeDetail message from the specified reader or buffer.
         * @function decode
         * @memberof SysMsg.LikeDetail
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {SysMsg.LikeDetail} LikeDetail
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LikeDetail.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.SysMsg.LikeDetail();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.txt = reader.string();
                        break;
                    }
                case 3: {
                        message.uin = reader.uint32();
                        break;
                    }
                case 5: {
                        message.nickname = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for LikeDetail
         * @function getTypeUrl
         * @memberof SysMsg.LikeDetail
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        LikeDetail.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/SysMsg.LikeDetail";
        };

        return LikeDetail;
    })();

    SysMsg.LikeMsg = (function() {

        /**
         * Properties of a LikeMsg.
         * @memberof SysMsg
         * @interface ILikeMsg
         * @property {number|null} [count] LikeMsg count
         * @property {number|null} [time] LikeMsg time
         * @property {SysMsg.ILikeDetail|null} [detail] LikeMsg detail
         */

        /**
         * Constructs a new LikeMsg.
         * @memberof SysMsg
         * @classdesc Represents a LikeMsg.
         * @implements ILikeMsg
         * @constructor
         * @param {SysMsg.ILikeMsg=} [properties] Properties to set
         */
        function LikeMsg(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * LikeMsg count.
         * @member {number} count
         * @memberof SysMsg.LikeMsg
         * @instance
         */
        LikeMsg.prototype.count = 0;

        /**
         * LikeMsg time.
         * @member {number} time
         * @memberof SysMsg.LikeMsg
         * @instance
         */
        LikeMsg.prototype.time = 0;

        /**
         * LikeMsg detail.
         * @member {SysMsg.ILikeDetail|null|undefined} detail
         * @memberof SysMsg.LikeMsg
         * @instance
         */
        LikeMsg.prototype.detail = null;

        /**
         * Encodes the specified LikeMsg message. Does not implicitly {@link SysMsg.LikeMsg.verify|verify} messages.
         * @function encode
         * @memberof SysMsg.LikeMsg
         * @static
         * @param {SysMsg.ILikeMsg} message LikeMsg message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LikeMsg.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.count != null && Object.hasOwnProperty.call(message, "count"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.count);
            if (message.time != null && Object.hasOwnProperty.call(message, "time"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.time);
            if (message.detail != null && Object.hasOwnProperty.call(message, "detail"))
                $root.SysMsg.LikeDetail.encode(message.detail, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a LikeMsg message from the specified reader or buffer.
         * @function decode
         * @memberof SysMsg.LikeMsg
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {SysMsg.LikeMsg} LikeMsg
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LikeMsg.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.SysMsg.LikeMsg();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.count = reader.uint32();
                        break;
                    }
                case 2: {
                        message.time = reader.uint32();
                        break;
                    }
                case 3: {
                        message.detail = $root.SysMsg.LikeDetail.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for LikeMsg
         * @function getTypeUrl
         * @memberof SysMsg.LikeMsg
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        LikeMsg.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/SysMsg.LikeMsg";
        };

        return LikeMsg;
    })();

    SysMsg.ProfileLikeSubTip = (function() {

        /**
         * Properties of a ProfileLikeSubTip.
         * @memberof SysMsg
         * @interface IProfileLikeSubTip
         * @property {SysMsg.ILikeMsg|null} [msg] ProfileLikeSubTip msg
         */

        /**
         * Constructs a new ProfileLikeSubTip.
         * @memberof SysMsg
         * @classdesc Represents a ProfileLikeSubTip.
         * @implements IProfileLikeSubTip
         * @constructor
         * @param {SysMsg.IProfileLikeSubTip=} [properties] Properties to set
         */
        function ProfileLikeSubTip(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * ProfileLikeSubTip msg.
         * @member {SysMsg.ILikeMsg|null|undefined} msg
         * @memberof SysMsg.ProfileLikeSubTip
         * @instance
         */
        ProfileLikeSubTip.prototype.msg = null;

        /**
         * Encodes the specified ProfileLikeSubTip message. Does not implicitly {@link SysMsg.ProfileLikeSubTip.verify|verify} messages.
         * @function encode
         * @memberof SysMsg.ProfileLikeSubTip
         * @static
         * @param {SysMsg.IProfileLikeSubTip} message ProfileLikeSubTip message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ProfileLikeSubTip.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.msg != null && Object.hasOwnProperty.call(message, "msg"))
                $root.SysMsg.LikeMsg.encode(message.msg, writer.uint32(/* id 14, wireType 2 =*/114).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a ProfileLikeSubTip message from the specified reader or buffer.
         * @function decode
         * @memberof SysMsg.ProfileLikeSubTip
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {SysMsg.ProfileLikeSubTip} ProfileLikeSubTip
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ProfileLikeSubTip.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.SysMsg.ProfileLikeSubTip();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 14: {
                        message.msg = $root.SysMsg.LikeMsg.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for ProfileLikeSubTip
         * @function getTypeUrl
         * @memberof SysMsg.ProfileLikeSubTip
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        ProfileLikeSubTip.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/SysMsg.ProfileLikeSubTip";
        };

        return ProfileLikeSubTip;
    })();

    SysMsg.ProfileLikeTip = (function() {

        /**
         * Properties of a ProfileLikeTip.
         * @memberof SysMsg
         * @interface IProfileLikeTip
         * @property {number|null} [msgType] ProfileLikeTip msgType
         * @property {number|null} [subType] ProfileLikeTip subType
         * @property {SysMsg.IProfileLikeSubTip|null} [content] ProfileLikeTip content
         */

        /**
         * Constructs a new ProfileLikeTip.
         * @memberof SysMsg
         * @classdesc Represents a ProfileLikeTip.
         * @implements IProfileLikeTip
         * @constructor
         * @param {SysMsg.IProfileLikeTip=} [properties] Properties to set
         */
        function ProfileLikeTip(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * ProfileLikeTip msgType.
         * @member {number} msgType
         * @memberof SysMsg.ProfileLikeTip
         * @instance
         */
        ProfileLikeTip.prototype.msgType = 0;

        /**
         * ProfileLikeTip subType.
         * @member {number} subType
         * @memberof SysMsg.ProfileLikeTip
         * @instance
         */
        ProfileLikeTip.prototype.subType = 0;

        /**
         * ProfileLikeTip content.
         * @member {SysMsg.IProfileLikeSubTip|null|undefined} content
         * @memberof SysMsg.ProfileLikeTip
         * @instance
         */
        ProfileLikeTip.prototype.content = null;

        /**
         * Encodes the specified ProfileLikeTip message. Does not implicitly {@link SysMsg.ProfileLikeTip.verify|verify} messages.
         * @function encode
         * @memberof SysMsg.ProfileLikeTip
         * @static
         * @param {SysMsg.IProfileLikeTip} message ProfileLikeTip message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ProfileLikeTip.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.msgType != null && Object.hasOwnProperty.call(message, "msgType"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.msgType);
            if (message.subType != null && Object.hasOwnProperty.call(message, "subType"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.subType);
            if (message.content != null && Object.hasOwnProperty.call(message, "content"))
                $root.SysMsg.ProfileLikeSubTip.encode(message.content, writer.uint32(/* id 203, wireType 2 =*/1626).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a ProfileLikeTip message from the specified reader or buffer.
         * @function decode
         * @memberof SysMsg.ProfileLikeTip
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {SysMsg.ProfileLikeTip} ProfileLikeTip
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ProfileLikeTip.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.SysMsg.ProfileLikeTip();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.msgType = reader.uint32();
                        break;
                    }
                case 2: {
                        message.subType = reader.uint32();
                        break;
                    }
                case 203: {
                        message.content = $root.SysMsg.ProfileLikeSubTip.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for ProfileLikeTip
         * @function getTypeUrl
         * @memberof SysMsg.ProfileLikeTip
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        ProfileLikeTip.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/SysMsg.ProfileLikeTip";
        };

        return ProfileLikeTip;
    })();

    SysMsg.GroupMemberChange = (function() {

        /**
         * Properties of a GroupMemberChange.
         * @memberof SysMsg
         * @interface IGroupMemberChange
         * @property {number|null} [groupCode] GroupMemberChange groupCode
         * @property {string|null} [memberUid] GroupMemberChange memberUid
         * @property {number|null} [type] GroupMemberChange type
         * @property {string|null} [adminUid] GroupMemberChange adminUid
         */

        /**
         * Constructs a new GroupMemberChange.
         * @memberof SysMsg
         * @classdesc Represents a GroupMemberChange.
         * @implements IGroupMemberChange
         * @constructor
         * @param {SysMsg.IGroupMemberChange=} [properties] Properties to set
         */
        function GroupMemberChange(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * GroupMemberChange groupCode.
         * @member {number} groupCode
         * @memberof SysMsg.GroupMemberChange
         * @instance
         */
        GroupMemberChange.prototype.groupCode = 0;

        /**
         * GroupMemberChange memberUid.
         * @member {string} memberUid
         * @memberof SysMsg.GroupMemberChange
         * @instance
         */
        GroupMemberChange.prototype.memberUid = "";

        /**
         * GroupMemberChange type.
         * @member {number} type
         * @memberof SysMsg.GroupMemberChange
         * @instance
         */
        GroupMemberChange.prototype.type = 0;

        /**
         * GroupMemberChange adminUid.
         * @member {string} adminUid
         * @memberof SysMsg.GroupMemberChange
         * @instance
         */
        GroupMemberChange.prototype.adminUid = "";

        /**
         * Encodes the specified GroupMemberChange message. Does not implicitly {@link SysMsg.GroupMemberChange.verify|verify} messages.
         * @function encode
         * @memberof SysMsg.GroupMemberChange
         * @static
         * @param {SysMsg.IGroupMemberChange} message GroupMemberChange message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        GroupMemberChange.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.groupCode != null && Object.hasOwnProperty.call(message, "groupCode"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.groupCode);
            if (message.memberUid != null && Object.hasOwnProperty.call(message, "memberUid"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.memberUid);
            if (message.type != null && Object.hasOwnProperty.call(message, "type"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.type);
            if (message.adminUid != null && Object.hasOwnProperty.call(message, "adminUid"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.adminUid);
            return writer;
        };

        /**
         * Decodes a GroupMemberChange message from the specified reader or buffer.
         * @function decode
         * @memberof SysMsg.GroupMemberChange
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {SysMsg.GroupMemberChange} GroupMemberChange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        GroupMemberChange.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.SysMsg.GroupMemberChange();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.groupCode = reader.uint32();
                        break;
                    }
                case 3: {
                        message.memberUid = reader.string();
                        break;
                    }
                case 4: {
                        message.type = reader.uint32();
                        break;
                    }
                case 5: {
                        message.adminUid = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for GroupMemberChange
         * @function getTypeUrl
         * @memberof SysMsg.GroupMemberChange
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        GroupMemberChange.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/SysMsg.GroupMemberChange";
        };

        return GroupMemberChange;
    })();

    SysMsg.GroupInvite = (function() {

        /**
         * Properties of a GroupInvite.
         * @memberof SysMsg
         * @interface IGroupInvite
         * @property {number|null} [groupCode] GroupInvite groupCode
         * @property {string|null} [operatorUid] GroupInvite operatorUid
         */

        /**
         * Constructs a new GroupInvite.
         * @memberof SysMsg
         * @classdesc Represents a GroupInvite.
         * @implements IGroupInvite
         * @constructor
         * @param {SysMsg.IGroupInvite=} [properties] Properties to set
         */
        function GroupInvite(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * GroupInvite groupCode.
         * @member {number} groupCode
         * @memberof SysMsg.GroupInvite
         * @instance
         */
        GroupInvite.prototype.groupCode = 0;

        /**
         * GroupInvite operatorUid.
         * @member {string} operatorUid
         * @memberof SysMsg.GroupInvite
         * @instance
         */
        GroupInvite.prototype.operatorUid = "";

        /**
         * Encodes the specified GroupInvite message. Does not implicitly {@link SysMsg.GroupInvite.verify|verify} messages.
         * @function encode
         * @memberof SysMsg.GroupInvite
         * @static
         * @param {SysMsg.IGroupInvite} message GroupInvite message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        GroupInvite.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.groupCode != null && Object.hasOwnProperty.call(message, "groupCode"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.groupCode);
            if (message.operatorUid != null && Object.hasOwnProperty.call(message, "operatorUid"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.operatorUid);
            return writer;
        };

        /**
         * Decodes a GroupInvite message from the specified reader or buffer.
         * @function decode
         * @memberof SysMsg.GroupInvite
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {SysMsg.GroupInvite} GroupInvite
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        GroupInvite.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.SysMsg.GroupInvite();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.groupCode = reader.uint32();
                        break;
                    }
                case 5: {
                        message.operatorUid = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for GroupInvite
         * @function getTypeUrl
         * @memberof SysMsg.GroupInvite
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        GroupInvite.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/SysMsg.GroupInvite";
        };

        return GroupInvite;
    })();

    return SysMsg;
})();

export const Msg = $root.Msg = (() => {

    /**
     * Namespace Msg.
     * @exports Msg
     * @namespace
     */
    const Msg = {};

    Msg.RoutingHead = (function() {

        /**
         * Properties of a RoutingHead.
         * @memberof Msg
         * @interface IRoutingHead
         * @property {number|Long|null} [fromUin] RoutingHead fromUin
         * @property {string|null} [fromUid] RoutingHead fromUid
         * @property {number|null} [fromAppid] RoutingHead fromAppid
         * @property {number|null} [fromInstid] RoutingHead fromInstid
         * @property {number|Long|null} [toUin] RoutingHead toUin
         * @property {string|null} [toUid] RoutingHead toUid
         * @property {Msg.IC2c|null} [c2c] RoutingHead c2c
         * @property {Msg.IGroup|null} [group] RoutingHead group
         */

        /**
         * Constructs a new RoutingHead.
         * @memberof Msg
         * @classdesc Represents a RoutingHead.
         * @implements IRoutingHead
         * @constructor
         * @param {Msg.IRoutingHead=} [properties] Properties to set
         */
        function RoutingHead(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * RoutingHead fromUin.
         * @member {number|Long|null|undefined} fromUin
         * @memberof Msg.RoutingHead
         * @instance
         */
        RoutingHead.prototype.fromUin = null;

        /**
         * RoutingHead fromUid.
         * @member {string|null|undefined} fromUid
         * @memberof Msg.RoutingHead
         * @instance
         */
        RoutingHead.prototype.fromUid = null;

        /**
         * RoutingHead fromAppid.
         * @member {number|null|undefined} fromAppid
         * @memberof Msg.RoutingHead
         * @instance
         */
        RoutingHead.prototype.fromAppid = null;

        /**
         * RoutingHead fromInstid.
         * @member {number|null|undefined} fromInstid
         * @memberof Msg.RoutingHead
         * @instance
         */
        RoutingHead.prototype.fromInstid = null;

        /**
         * RoutingHead toUin.
         * @member {number|Long|null|undefined} toUin
         * @memberof Msg.RoutingHead
         * @instance
         */
        RoutingHead.prototype.toUin = null;

        /**
         * RoutingHead toUid.
         * @member {string|null|undefined} toUid
         * @memberof Msg.RoutingHead
         * @instance
         */
        RoutingHead.prototype.toUid = null;

        /**
         * RoutingHead c2c.
         * @member {Msg.IC2c|null|undefined} c2c
         * @memberof Msg.RoutingHead
         * @instance
         */
        RoutingHead.prototype.c2c = null;

        /**
         * RoutingHead group.
         * @member {Msg.IGroup|null|undefined} group
         * @memberof Msg.RoutingHead
         * @instance
         */
        RoutingHead.prototype.group = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(RoutingHead.prototype, "_fromUin", {
            get: $util.oneOfGetter($oneOfFields = ["fromUin"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(RoutingHead.prototype, "_fromUid", {
            get: $util.oneOfGetter($oneOfFields = ["fromUid"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(RoutingHead.prototype, "_fromAppid", {
            get: $util.oneOfGetter($oneOfFields = ["fromAppid"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(RoutingHead.prototype, "_fromInstid", {
            get: $util.oneOfGetter($oneOfFields = ["fromInstid"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(RoutingHead.prototype, "_toUin", {
            get: $util.oneOfGetter($oneOfFields = ["toUin"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(RoutingHead.prototype, "_toUid", {
            get: $util.oneOfGetter($oneOfFields = ["toUid"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(RoutingHead.prototype, "_c2c", {
            get: $util.oneOfGetter($oneOfFields = ["c2c"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(RoutingHead.prototype, "_group", {
            get: $util.oneOfGetter($oneOfFields = ["group"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified RoutingHead message. Does not implicitly {@link Msg.RoutingHead.verify|verify} messages.
         * @function encode
         * @memberof Msg.RoutingHead
         * @static
         * @param {Msg.IRoutingHead} message RoutingHead message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RoutingHead.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.fromUin != null && Object.hasOwnProperty.call(message, "fromUin"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.fromUin);
            if (message.fromUid != null && Object.hasOwnProperty.call(message, "fromUid"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.fromUid);
            if (message.fromAppid != null && Object.hasOwnProperty.call(message, "fromAppid"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.fromAppid);
            if (message.fromInstid != null && Object.hasOwnProperty.call(message, "fromInstid"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.fromInstid);
            if (message.toUin != null && Object.hasOwnProperty.call(message, "toUin"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint64(message.toUin);
            if (message.toUid != null && Object.hasOwnProperty.call(message, "toUid"))
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.toUid);
            if (message.c2c != null && Object.hasOwnProperty.call(message, "c2c"))
                $root.Msg.C2c.encode(message.c2c, writer.uint32(/* id 7, wireType 2 =*/58).fork()).ldelim();
            if (message.group != null && Object.hasOwnProperty.call(message, "group"))
                $root.Msg.Group.encode(message.group, writer.uint32(/* id 8, wireType 2 =*/66).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a RoutingHead message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.RoutingHead
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.RoutingHead} RoutingHead
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RoutingHead.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.RoutingHead();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.fromUin = reader.uint64();
                        break;
                    }
                case 2: {
                        message.fromUid = reader.string();
                        break;
                    }
                case 3: {
                        message.fromAppid = reader.uint32();
                        break;
                    }
                case 4: {
                        message.fromInstid = reader.uint32();
                        break;
                    }
                case 5: {
                        message.toUin = reader.uint64();
                        break;
                    }
                case 6: {
                        message.toUid = reader.string();
                        break;
                    }
                case 7: {
                        message.c2c = $root.Msg.C2c.decode(reader, reader.uint32());
                        break;
                    }
                case 8: {
                        message.group = $root.Msg.Group.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for RoutingHead
         * @function getTypeUrl
         * @memberof Msg.RoutingHead
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        RoutingHead.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.RoutingHead";
        };

        return RoutingHead;
    })();

    Msg.C2c = (function() {

        /**
         * Properties of a C2c.
         * @memberof Msg
         * @interface IC2c
         * @property {string|null} [friendName] C2c friendName
         */

        /**
         * Constructs a new C2c.
         * @memberof Msg
         * @classdesc Represents a C2c.
         * @implements IC2c
         * @constructor
         * @param {Msg.IC2c=} [properties] Properties to set
         */
        function C2c(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * C2c friendName.
         * @member {string|null|undefined} friendName
         * @memberof Msg.C2c
         * @instance
         */
        C2c.prototype.friendName = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(C2c.prototype, "_friendName", {
            get: $util.oneOfGetter($oneOfFields = ["friendName"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified C2c message. Does not implicitly {@link Msg.C2c.verify|verify} messages.
         * @function encode
         * @memberof Msg.C2c
         * @static
         * @param {Msg.IC2c} message C2c message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        C2c.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.friendName != null && Object.hasOwnProperty.call(message, "friendName"))
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.friendName);
            return writer;
        };

        /**
         * Decodes a C2c message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.C2c
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.C2c} C2c
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        C2c.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.C2c();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 6: {
                        message.friendName = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for C2c
         * @function getTypeUrl
         * @memberof Msg.C2c
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        C2c.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.C2c";
        };

        return C2c;
    })();

    Msg.Group = (function() {

        /**
         * Properties of a Group.
         * @memberof Msg
         * @interface IGroup
         * @property {number|Long|null} [groupCode] Group groupCode
         * @property {number|null} [groupType] Group groupType
         * @property {number|Long|null} [groupInfoSeq] Group groupInfoSeq
         * @property {string|null} [groupCard] Group groupCard
         * @property {number|null} [groupCardType] Group groupCardType
         * @property {number|null} [groupLevel] Group groupLevel
         * @property {string|null} [groupName] Group groupName
         * @property {string|null} [extGroupKeyInfo] Group extGroupKeyInfo
         * @property {number|null} [msgFlag] Group msgFlag
         */

        /**
         * Constructs a new Group.
         * @memberof Msg
         * @classdesc Represents a Group.
         * @implements IGroup
         * @constructor
         * @param {Msg.IGroup=} [properties] Properties to set
         */
        function Group(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Group groupCode.
         * @member {number|Long|null|undefined} groupCode
         * @memberof Msg.Group
         * @instance
         */
        Group.prototype.groupCode = null;

        /**
         * Group groupType.
         * @member {number|null|undefined} groupType
         * @memberof Msg.Group
         * @instance
         */
        Group.prototype.groupType = null;

        /**
         * Group groupInfoSeq.
         * @member {number|Long|null|undefined} groupInfoSeq
         * @memberof Msg.Group
         * @instance
         */
        Group.prototype.groupInfoSeq = null;

        /**
         * Group groupCard.
         * @member {string|null|undefined} groupCard
         * @memberof Msg.Group
         * @instance
         */
        Group.prototype.groupCard = null;

        /**
         * Group groupCardType.
         * @member {number|null|undefined} groupCardType
         * @memberof Msg.Group
         * @instance
         */
        Group.prototype.groupCardType = null;

        /**
         * Group groupLevel.
         * @member {number|null|undefined} groupLevel
         * @memberof Msg.Group
         * @instance
         */
        Group.prototype.groupLevel = null;

        /**
         * Group groupName.
         * @member {string|null|undefined} groupName
         * @memberof Msg.Group
         * @instance
         */
        Group.prototype.groupName = null;

        /**
         * Group extGroupKeyInfo.
         * @member {string|null|undefined} extGroupKeyInfo
         * @memberof Msg.Group
         * @instance
         */
        Group.prototype.extGroupKeyInfo = null;

        /**
         * Group msgFlag.
         * @member {number|null|undefined} msgFlag
         * @memberof Msg.Group
         * @instance
         */
        Group.prototype.msgFlag = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Group.prototype, "_groupCode", {
            get: $util.oneOfGetter($oneOfFields = ["groupCode"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Group.prototype, "_groupType", {
            get: $util.oneOfGetter($oneOfFields = ["groupType"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Group.prototype, "_groupInfoSeq", {
            get: $util.oneOfGetter($oneOfFields = ["groupInfoSeq"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Group.prototype, "_groupCard", {
            get: $util.oneOfGetter($oneOfFields = ["groupCard"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Group.prototype, "_groupCardType", {
            get: $util.oneOfGetter($oneOfFields = ["groupCardType"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Group.prototype, "_groupLevel", {
            get: $util.oneOfGetter($oneOfFields = ["groupLevel"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Group.prototype, "_groupName", {
            get: $util.oneOfGetter($oneOfFields = ["groupName"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Group.prototype, "_extGroupKeyInfo", {
            get: $util.oneOfGetter($oneOfFields = ["extGroupKeyInfo"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Group.prototype, "_msgFlag", {
            get: $util.oneOfGetter($oneOfFields = ["msgFlag"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified Group message. Does not implicitly {@link Msg.Group.verify|verify} messages.
         * @function encode
         * @memberof Msg.Group
         * @static
         * @param {Msg.IGroup} message Group message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Group.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.groupCode != null && Object.hasOwnProperty.call(message, "groupCode"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint64(message.groupCode);
            if (message.groupType != null && Object.hasOwnProperty.call(message, "groupType"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.groupType);
            if (message.groupInfoSeq != null && Object.hasOwnProperty.call(message, "groupInfoSeq"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint64(message.groupInfoSeq);
            if (message.groupCard != null && Object.hasOwnProperty.call(message, "groupCard"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.groupCard);
            if (message.groupCardType != null && Object.hasOwnProperty.call(message, "groupCardType"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.groupCardType);
            if (message.groupLevel != null && Object.hasOwnProperty.call(message, "groupLevel"))
                writer.uint32(/* id 6, wireType 0 =*/48).uint32(message.groupLevel);
            if (message.groupName != null && Object.hasOwnProperty.call(message, "groupName"))
                writer.uint32(/* id 7, wireType 2 =*/58).string(message.groupName);
            if (message.extGroupKeyInfo != null && Object.hasOwnProperty.call(message, "extGroupKeyInfo"))
                writer.uint32(/* id 8, wireType 2 =*/66).string(message.extGroupKeyInfo);
            if (message.msgFlag != null && Object.hasOwnProperty.call(message, "msgFlag"))
                writer.uint32(/* id 9, wireType 0 =*/72).uint32(message.msgFlag);
            return writer;
        };

        /**
         * Decodes a Group message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.Group
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.Group} Group
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Group.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.Group();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.groupCode = reader.uint64();
                        break;
                    }
                case 2: {
                        message.groupType = reader.uint32();
                        break;
                    }
                case 3: {
                        message.groupInfoSeq = reader.uint64();
                        break;
                    }
                case 4: {
                        message.groupCard = reader.string();
                        break;
                    }
                case 5: {
                        message.groupCardType = reader.uint32();
                        break;
                    }
                case 6: {
                        message.groupLevel = reader.uint32();
                        break;
                    }
                case 7: {
                        message.groupName = reader.string();
                        break;
                    }
                case 8: {
                        message.extGroupKeyInfo = reader.string();
                        break;
                    }
                case 9: {
                        message.msgFlag = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for Group
         * @function getTypeUrl
         * @memberof Msg.Group
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Group.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.Group";
        };

        return Group;
    })();

    Msg.ContentHead = (function() {

        /**
         * Properties of a ContentHead.
         * @memberof Msg
         * @interface IContentHead
         * @property {number|null} [msgType] ContentHead msgType
         * @property {number|null} [subType] ContentHead subType
         * @property {number|null} [c2cCmd] ContentHead c2cCmd
         * @property {number|Long|null} [random] ContentHead random
         * @property {number|Long|null} [msgSeq] ContentHead msgSeq
         * @property {number|Long|null} [msgTime] ContentHead msgTime
         * @property {number|null} [pkgNum] ContentHead pkgNum
         * @property {number|null} [pkgIndex] ContentHead pkgIndex
         * @property {number|null} [divSeq] ContentHead divSeq
         * @property {number|null} [autoReply] ContentHead autoReply
         * @property {number|Long|null} [ntMsgSeq] ContentHead ntMsgSeq
         * @property {number|Long|null} [msgUid] ContentHead msgUid
         * @property {Msg.IContentHeadField15|null} [field15] ContentHead field15
         */

        /**
         * Constructs a new ContentHead.
         * @memberof Msg
         * @classdesc Represents a ContentHead.
         * @implements IContentHead
         * @constructor
         * @param {Msg.IContentHead=} [properties] Properties to set
         */
        function ContentHead(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * ContentHead msgType.
         * @member {number|null|undefined} msgType
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.msgType = null;

        /**
         * ContentHead subType.
         * @member {number|null|undefined} subType
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.subType = null;

        /**
         * ContentHead c2cCmd.
         * @member {number|null|undefined} c2cCmd
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.c2cCmd = null;

        /**
         * ContentHead random.
         * @member {number|Long|null|undefined} random
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.random = null;

        /**
         * ContentHead msgSeq.
         * @member {number|Long|null|undefined} msgSeq
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.msgSeq = null;

        /**
         * ContentHead msgTime.
         * @member {number|Long|null|undefined} msgTime
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.msgTime = null;

        /**
         * ContentHead pkgNum.
         * @member {number|null|undefined} pkgNum
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.pkgNum = null;

        /**
         * ContentHead pkgIndex.
         * @member {number|null|undefined} pkgIndex
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.pkgIndex = null;

        /**
         * ContentHead divSeq.
         * @member {number|null|undefined} divSeq
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.divSeq = null;

        /**
         * ContentHead autoReply.
         * @member {number|null|undefined} autoReply
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.autoReply = null;

        /**
         * ContentHead ntMsgSeq.
         * @member {number|Long|null|undefined} ntMsgSeq
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.ntMsgSeq = null;

        /**
         * ContentHead msgUid.
         * @member {number|Long|null|undefined} msgUid
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.msgUid = null;

        /**
         * ContentHead field15.
         * @member {Msg.IContentHeadField15|null|undefined} field15
         * @memberof Msg.ContentHead
         * @instance
         */
        ContentHead.prototype.field15 = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_msgType", {
            get: $util.oneOfGetter($oneOfFields = ["msgType"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_subType", {
            get: $util.oneOfGetter($oneOfFields = ["subType"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_c2cCmd", {
            get: $util.oneOfGetter($oneOfFields = ["c2cCmd"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_random", {
            get: $util.oneOfGetter($oneOfFields = ["random"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_msgSeq", {
            get: $util.oneOfGetter($oneOfFields = ["msgSeq"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_msgTime", {
            get: $util.oneOfGetter($oneOfFields = ["msgTime"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_pkgNum", {
            get: $util.oneOfGetter($oneOfFields = ["pkgNum"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_pkgIndex", {
            get: $util.oneOfGetter($oneOfFields = ["pkgIndex"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_divSeq", {
            get: $util.oneOfGetter($oneOfFields = ["divSeq"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_autoReply", {
            get: $util.oneOfGetter($oneOfFields = ["autoReply"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_ntMsgSeq", {
            get: $util.oneOfGetter($oneOfFields = ["ntMsgSeq"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_msgUid", {
            get: $util.oneOfGetter($oneOfFields = ["msgUid"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHead.prototype, "_field15", {
            get: $util.oneOfGetter($oneOfFields = ["field15"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified ContentHead message. Does not implicitly {@link Msg.ContentHead.verify|verify} messages.
         * @function encode
         * @memberof Msg.ContentHead
         * @static
         * @param {Msg.IContentHead} message ContentHead message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ContentHead.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.msgType != null && Object.hasOwnProperty.call(message, "msgType"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.msgType);
            if (message.subType != null && Object.hasOwnProperty.call(message, "subType"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.subType);
            if (message.c2cCmd != null && Object.hasOwnProperty.call(message, "c2cCmd"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.c2cCmd);
            if (message.random != null && Object.hasOwnProperty.call(message, "random"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint64(message.random);
            if (message.msgSeq != null && Object.hasOwnProperty.call(message, "msgSeq"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint64(message.msgSeq);
            if (message.msgTime != null && Object.hasOwnProperty.call(message, "msgTime"))
                writer.uint32(/* id 6, wireType 0 =*/48).uint64(message.msgTime);
            if (message.pkgNum != null && Object.hasOwnProperty.call(message, "pkgNum"))
                writer.uint32(/* id 7, wireType 0 =*/56).uint32(message.pkgNum);
            if (message.pkgIndex != null && Object.hasOwnProperty.call(message, "pkgIndex"))
                writer.uint32(/* id 8, wireType 0 =*/64).uint32(message.pkgIndex);
            if (message.divSeq != null && Object.hasOwnProperty.call(message, "divSeq"))
                writer.uint32(/* id 9, wireType 0 =*/72).uint32(message.divSeq);
            if (message.autoReply != null && Object.hasOwnProperty.call(message, "autoReply"))
                writer.uint32(/* id 10, wireType 0 =*/80).uint32(message.autoReply);
            if (message.ntMsgSeq != null && Object.hasOwnProperty.call(message, "ntMsgSeq"))
                writer.uint32(/* id 11, wireType 0 =*/88).uint64(message.ntMsgSeq);
            if (message.msgUid != null && Object.hasOwnProperty.call(message, "msgUid"))
                writer.uint32(/* id 12, wireType 0 =*/96).uint64(message.msgUid);
            if (message.field15 != null && Object.hasOwnProperty.call(message, "field15"))
                $root.Msg.ContentHeadField15.encode(message.field15, writer.uint32(/* id 15, wireType 2 =*/122).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a ContentHead message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.ContentHead
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.ContentHead} ContentHead
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ContentHead.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.ContentHead();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.msgType = reader.uint32();
                        break;
                    }
                case 2: {
                        message.subType = reader.uint32();
                        break;
                    }
                case 3: {
                        message.c2cCmd = reader.uint32();
                        break;
                    }
                case 4: {
                        message.random = reader.uint64();
                        break;
                    }
                case 5: {
                        message.msgSeq = reader.uint64();
                        break;
                    }
                case 6: {
                        message.msgTime = reader.uint64();
                        break;
                    }
                case 7: {
                        message.pkgNum = reader.uint32();
                        break;
                    }
                case 8: {
                        message.pkgIndex = reader.uint32();
                        break;
                    }
                case 9: {
                        message.divSeq = reader.uint32();
                        break;
                    }
                case 10: {
                        message.autoReply = reader.uint32();
                        break;
                    }
                case 11: {
                        message.ntMsgSeq = reader.uint64();
                        break;
                    }
                case 12: {
                        message.msgUid = reader.uint64();
                        break;
                    }
                case 15: {
                        message.field15 = $root.Msg.ContentHeadField15.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for ContentHead
         * @function getTypeUrl
         * @memberof Msg.ContentHead
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        ContentHead.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.ContentHead";
        };

        return ContentHead;
    })();

    Msg.ContentHeadField15 = (function() {

        /**
         * Properties of a ContentHeadField15.
         * @memberof Msg
         * @interface IContentHeadField15
         * @property {number|null} [field1] ContentHeadField15 field1
         * @property {number|null} [field2] ContentHeadField15 field2
         * @property {number|null} [field3] ContentHeadField15 field3
         * @property {string|null} [field4] ContentHeadField15 field4
         * @property {string|null} [field5] ContentHeadField15 field5
         */

        /**
         * Constructs a new ContentHeadField15.
         * @memberof Msg
         * @classdesc Represents a ContentHeadField15.
         * @implements IContentHeadField15
         * @constructor
         * @param {Msg.IContentHeadField15=} [properties] Properties to set
         */
        function ContentHeadField15(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * ContentHeadField15 field1.
         * @member {number|null|undefined} field1
         * @memberof Msg.ContentHeadField15
         * @instance
         */
        ContentHeadField15.prototype.field1 = null;

        /**
         * ContentHeadField15 field2.
         * @member {number|null|undefined} field2
         * @memberof Msg.ContentHeadField15
         * @instance
         */
        ContentHeadField15.prototype.field2 = null;

        /**
         * ContentHeadField15 field3.
         * @member {number|null|undefined} field3
         * @memberof Msg.ContentHeadField15
         * @instance
         */
        ContentHeadField15.prototype.field3 = null;

        /**
         * ContentHeadField15 field4.
         * @member {string|null|undefined} field4
         * @memberof Msg.ContentHeadField15
         * @instance
         */
        ContentHeadField15.prototype.field4 = null;

        /**
         * ContentHeadField15 field5.
         * @member {string|null|undefined} field5
         * @memberof Msg.ContentHeadField15
         * @instance
         */
        ContentHeadField15.prototype.field5 = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHeadField15.prototype, "_field1", {
            get: $util.oneOfGetter($oneOfFields = ["field1"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHeadField15.prototype, "_field2", {
            get: $util.oneOfGetter($oneOfFields = ["field2"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHeadField15.prototype, "_field3", {
            get: $util.oneOfGetter($oneOfFields = ["field3"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHeadField15.prototype, "_field4", {
            get: $util.oneOfGetter($oneOfFields = ["field4"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(ContentHeadField15.prototype, "_field5", {
            get: $util.oneOfGetter($oneOfFields = ["field5"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified ContentHeadField15 message. Does not implicitly {@link Msg.ContentHeadField15.verify|verify} messages.
         * @function encode
         * @memberof Msg.ContentHeadField15
         * @static
         * @param {Msg.IContentHeadField15} message ContentHeadField15 message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ContentHeadField15.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.field1 != null && Object.hasOwnProperty.call(message, "field1"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.field1);
            if (message.field2 != null && Object.hasOwnProperty.call(message, "field2"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.field2);
            if (message.field3 != null && Object.hasOwnProperty.call(message, "field3"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.field3);
            if (message.field4 != null && Object.hasOwnProperty.call(message, "field4"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.field4);
            if (message.field5 != null && Object.hasOwnProperty.call(message, "field5"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.field5);
            return writer;
        };

        /**
         * Decodes a ContentHeadField15 message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.ContentHeadField15
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.ContentHeadField15} ContentHeadField15
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ContentHeadField15.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.ContentHeadField15();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.field1 = reader.uint32();
                        break;
                    }
                case 2: {
                        message.field2 = reader.uint32();
                        break;
                    }
                case 3: {
                        message.field3 = reader.uint32();
                        break;
                    }
                case 4: {
                        message.field4 = reader.string();
                        break;
                    }
                case 5: {
                        message.field5 = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for ContentHeadField15
         * @function getTypeUrl
         * @memberof Msg.ContentHeadField15
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        ContentHeadField15.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.ContentHeadField15";
        };

        return ContentHeadField15;
    })();

    Msg.Message = (function() {

        /**
         * Properties of a Message.
         * @memberof Msg
         * @interface IMessage
         * @property {Msg.IRoutingHead|null} [routingHead] Message routingHead
         * @property {Msg.IContentHead|null} [contentHead] Message contentHead
         * @property {Msg.IMessageBody|null} [body] Message body
         */

        /**
         * Constructs a new Message.
         * @memberof Msg
         * @classdesc Represents a Message.
         * @implements IMessage
         * @constructor
         * @param {Msg.IMessage=} [properties] Properties to set
         */
        function Message(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Message routingHead.
         * @member {Msg.IRoutingHead|null|undefined} routingHead
         * @memberof Msg.Message
         * @instance
         */
        Message.prototype.routingHead = null;

        /**
         * Message contentHead.
         * @member {Msg.IContentHead|null|undefined} contentHead
         * @memberof Msg.Message
         * @instance
         */
        Message.prototype.contentHead = null;

        /**
         * Message body.
         * @member {Msg.IMessageBody|null|undefined} body
         * @memberof Msg.Message
         * @instance
         */
        Message.prototype.body = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Message.prototype, "_routingHead", {
            get: $util.oneOfGetter($oneOfFields = ["routingHead"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Message.prototype, "_contentHead", {
            get: $util.oneOfGetter($oneOfFields = ["contentHead"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Message.prototype, "_body", {
            get: $util.oneOfGetter($oneOfFields = ["body"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified Message message. Does not implicitly {@link Msg.Message.verify|verify} messages.
         * @function encode
         * @memberof Msg.Message
         * @static
         * @param {Msg.IMessage} message Message message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Message.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.routingHead != null && Object.hasOwnProperty.call(message, "routingHead"))
                $root.Msg.RoutingHead.encode(message.routingHead, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.contentHead != null && Object.hasOwnProperty.call(message, "contentHead"))
                $root.Msg.ContentHead.encode(message.contentHead, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.body != null && Object.hasOwnProperty.call(message, "body"))
                $root.Msg.MessageBody.encode(message.body, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a Message message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.Message
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.Message} Message
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Message.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.Message();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.routingHead = $root.Msg.RoutingHead.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.contentHead = $root.Msg.ContentHead.decode(reader, reader.uint32());
                        break;
                    }
                case 3: {
                        message.body = $root.Msg.MessageBody.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for Message
         * @function getTypeUrl
         * @memberof Msg.Message
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Message.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.Message";
        };

        return Message;
    })();

    Msg.MessageBody = (function() {

        /**
         * Properties of a MessageBody.
         * @memberof Msg
         * @interface IMessageBody
         * @property {Msg.IRichText|null} [richText] MessageBody richText
         * @property {Uint8Array|null} [msgContent] MessageBody msgContent
         * @property {Uint8Array|null} [msgEncryptContent] MessageBody msgEncryptContent
         */

        /**
         * Constructs a new MessageBody.
         * @memberof Msg
         * @classdesc Represents a MessageBody.
         * @implements IMessageBody
         * @constructor
         * @param {Msg.IMessageBody=} [properties] Properties to set
         */
        function MessageBody(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * MessageBody richText.
         * @member {Msg.IRichText|null|undefined} richText
         * @memberof Msg.MessageBody
         * @instance
         */
        MessageBody.prototype.richText = null;

        /**
         * MessageBody msgContent.
         * @member {Uint8Array|null|undefined} msgContent
         * @memberof Msg.MessageBody
         * @instance
         */
        MessageBody.prototype.msgContent = null;

        /**
         * MessageBody msgEncryptContent.
         * @member {Uint8Array|null|undefined} msgEncryptContent
         * @memberof Msg.MessageBody
         * @instance
         */
        MessageBody.prototype.msgEncryptContent = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(MessageBody.prototype, "_richText", {
            get: $util.oneOfGetter($oneOfFields = ["richText"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(MessageBody.prototype, "_msgContent", {
            get: $util.oneOfGetter($oneOfFields = ["msgContent"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(MessageBody.prototype, "_msgEncryptContent", {
            get: $util.oneOfGetter($oneOfFields = ["msgEncryptContent"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified MessageBody message. Does not implicitly {@link Msg.MessageBody.verify|verify} messages.
         * @function encode
         * @memberof Msg.MessageBody
         * @static
         * @param {Msg.IMessageBody} message MessageBody message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        MessageBody.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.richText != null && Object.hasOwnProperty.call(message, "richText"))
                $root.Msg.RichText.encode(message.richText, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.msgContent != null && Object.hasOwnProperty.call(message, "msgContent"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.msgContent);
            if (message.msgEncryptContent != null && Object.hasOwnProperty.call(message, "msgEncryptContent"))
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.msgEncryptContent);
            return writer;
        };

        /**
         * Decodes a MessageBody message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.MessageBody
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.MessageBody} MessageBody
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        MessageBody.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.MessageBody();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.richText = $root.Msg.RichText.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.msgContent = reader.bytes();
                        break;
                    }
                case 3: {
                        message.msgEncryptContent = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for MessageBody
         * @function getTypeUrl
         * @memberof Msg.MessageBody
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        MessageBody.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.MessageBody";
        };

        return MessageBody;
    })();

    Msg.RichText = (function() {

        /**
         * Properties of a RichText.
         * @memberof Msg
         * @interface IRichText
         * @property {Msg.IAttr|null} [attr] RichText attr
         * @property {Array.<Msg.IElem>|null} [elems] RichText elems
         */

        /**
         * Constructs a new RichText.
         * @memberof Msg
         * @classdesc Represents a RichText.
         * @implements IRichText
         * @constructor
         * @param {Msg.IRichText=} [properties] Properties to set
         */
        function RichText(properties) {
            this.elems = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * RichText attr.
         * @member {Msg.IAttr|null|undefined} attr
         * @memberof Msg.RichText
         * @instance
         */
        RichText.prototype.attr = null;

        /**
         * RichText elems.
         * @member {Array.<Msg.IElem>} elems
         * @memberof Msg.RichText
         * @instance
         */
        RichText.prototype.elems = $util.emptyArray;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(RichText.prototype, "_attr", {
            get: $util.oneOfGetter($oneOfFields = ["attr"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified RichText message. Does not implicitly {@link Msg.RichText.verify|verify} messages.
         * @function encode
         * @memberof Msg.RichText
         * @static
         * @param {Msg.IRichText} message RichText message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        RichText.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.attr != null && Object.hasOwnProperty.call(message, "attr"))
                $root.Msg.Attr.encode(message.attr, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.elems != null && message.elems.length)
                for (let i = 0; i < message.elems.length; ++i)
                    $root.Msg.Elem.encode(message.elems[i], writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a RichText message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.RichText
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.RichText} RichText
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        RichText.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.RichText();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.attr = $root.Msg.Attr.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        if (!(message.elems && message.elems.length))
                            message.elems = [];
                        message.elems.push($root.Msg.Elem.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for RichText
         * @function getTypeUrl
         * @memberof Msg.RichText
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        RichText.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.RichText";
        };

        return RichText;
    })();

    Msg.Elem = (function() {

        /**
         * Properties of an Elem.
         * @memberof Msg
         * @interface IElem
         * @property {Msg.IText|null} [text] Elem text
         * @property {Msg.IFace|null} [face] Elem face
         * @property {Msg.ILightAppElem|null} [lightApp] Elem lightApp
         * @property {Msg.ICommonElem|null} [commonElem] Elem commonElem
         */

        /**
         * Constructs a new Elem.
         * @memberof Msg
         * @classdesc Represents an Elem.
         * @implements IElem
         * @constructor
         * @param {Msg.IElem=} [properties] Properties to set
         */
        function Elem(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Elem text.
         * @member {Msg.IText|null|undefined} text
         * @memberof Msg.Elem
         * @instance
         */
        Elem.prototype.text = null;

        /**
         * Elem face.
         * @member {Msg.IFace|null|undefined} face
         * @memberof Msg.Elem
         * @instance
         */
        Elem.prototype.face = null;

        /**
         * Elem lightApp.
         * @member {Msg.ILightAppElem|null|undefined} lightApp
         * @memberof Msg.Elem
         * @instance
         */
        Elem.prototype.lightApp = null;

        /**
         * Elem commonElem.
         * @member {Msg.ICommonElem|null|undefined} commonElem
         * @memberof Msg.Elem
         * @instance
         */
        Elem.prototype.commonElem = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Elem.prototype, "_text", {
            get: $util.oneOfGetter($oneOfFields = ["text"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Elem.prototype, "_face", {
            get: $util.oneOfGetter($oneOfFields = ["face"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Elem.prototype, "_lightApp", {
            get: $util.oneOfGetter($oneOfFields = ["lightApp"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Elem.prototype, "_commonElem", {
            get: $util.oneOfGetter($oneOfFields = ["commonElem"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified Elem message. Does not implicitly {@link Msg.Elem.verify|verify} messages.
         * @function encode
         * @memberof Msg.Elem
         * @static
         * @param {Msg.IElem} message Elem message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Elem.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.text != null && Object.hasOwnProperty.call(message, "text"))
                $root.Msg.Text.encode(message.text, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.face != null && Object.hasOwnProperty.call(message, "face"))
                $root.Msg.Face.encode(message.face, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.lightApp != null && Object.hasOwnProperty.call(message, "lightApp"))
                $root.Msg.LightAppElem.encode(message.lightApp, writer.uint32(/* id 51, wireType 2 =*/410).fork()).ldelim();
            if (message.commonElem != null && Object.hasOwnProperty.call(message, "commonElem"))
                $root.Msg.CommonElem.encode(message.commonElem, writer.uint32(/* id 53, wireType 2 =*/426).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes an Elem message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.Elem
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.Elem} Elem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Elem.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.Elem();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.text = $root.Msg.Text.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.face = $root.Msg.Face.decode(reader, reader.uint32());
                        break;
                    }
                case 51: {
                        message.lightApp = $root.Msg.LightAppElem.decode(reader, reader.uint32());
                        break;
                    }
                case 53: {
                        message.commonElem = $root.Msg.CommonElem.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for Elem
         * @function getTypeUrl
         * @memberof Msg.Elem
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Elem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.Elem";
        };

        return Elem;
    })();

    Msg.Text = (function() {

        /**
         * Properties of a Text.
         * @memberof Msg
         * @interface IText
         * @property {string|null} [str] Text str
         * @property {string|null} [link] Text link
         * @property {Uint8Array|null} [attr6Buf] Text attr6Buf
         * @property {Uint8Array|null} [attr7Buf] Text attr7Buf
         * @property {Uint8Array|null} [buf] Text buf
         * @property {Uint8Array|null} [pbReserve] Text pbReserve
         */

        /**
         * Constructs a new Text.
         * @memberof Msg
         * @classdesc Represents a Text.
         * @implements IText
         * @constructor
         * @param {Msg.IText=} [properties] Properties to set
         */
        function Text(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Text str.
         * @member {string|null|undefined} str
         * @memberof Msg.Text
         * @instance
         */
        Text.prototype.str = null;

        /**
         * Text link.
         * @member {string|null|undefined} link
         * @memberof Msg.Text
         * @instance
         */
        Text.prototype.link = null;

        /**
         * Text attr6Buf.
         * @member {Uint8Array|null|undefined} attr6Buf
         * @memberof Msg.Text
         * @instance
         */
        Text.prototype.attr6Buf = null;

        /**
         * Text attr7Buf.
         * @member {Uint8Array|null|undefined} attr7Buf
         * @memberof Msg.Text
         * @instance
         */
        Text.prototype.attr7Buf = null;

        /**
         * Text buf.
         * @member {Uint8Array|null|undefined} buf
         * @memberof Msg.Text
         * @instance
         */
        Text.prototype.buf = null;

        /**
         * Text pbReserve.
         * @member {Uint8Array|null|undefined} pbReserve
         * @memberof Msg.Text
         * @instance
         */
        Text.prototype.pbReserve = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Text.prototype, "_str", {
            get: $util.oneOfGetter($oneOfFields = ["str"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Text.prototype, "_link", {
            get: $util.oneOfGetter($oneOfFields = ["link"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Text.prototype, "_attr6Buf", {
            get: $util.oneOfGetter($oneOfFields = ["attr6Buf"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Text.prototype, "_attr7Buf", {
            get: $util.oneOfGetter($oneOfFields = ["attr7Buf"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Text.prototype, "_buf", {
            get: $util.oneOfGetter($oneOfFields = ["buf"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Text.prototype, "_pbReserve", {
            get: $util.oneOfGetter($oneOfFields = ["pbReserve"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified Text message. Does not implicitly {@link Msg.Text.verify|verify} messages.
         * @function encode
         * @memberof Msg.Text
         * @static
         * @param {Msg.IText} message Text message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Text.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.str != null && Object.hasOwnProperty.call(message, "str"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.str);
            if (message.link != null && Object.hasOwnProperty.call(message, "link"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.link);
            if (message.attr6Buf != null && Object.hasOwnProperty.call(message, "attr6Buf"))
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.attr6Buf);
            if (message.attr7Buf != null && Object.hasOwnProperty.call(message, "attr7Buf"))
                writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.attr7Buf);
            if (message.buf != null && Object.hasOwnProperty.call(message, "buf"))
                writer.uint32(/* id 11, wireType 2 =*/90).bytes(message.buf);
            if (message.pbReserve != null && Object.hasOwnProperty.call(message, "pbReserve"))
                writer.uint32(/* id 12, wireType 2 =*/98).bytes(message.pbReserve);
            return writer;
        };

        /**
         * Decodes a Text message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.Text
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.Text} Text
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Text.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.Text();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.str = reader.string();
                        break;
                    }
                case 2: {
                        message.link = reader.string();
                        break;
                    }
                case 3: {
                        message.attr6Buf = reader.bytes();
                        break;
                    }
                case 4: {
                        message.attr7Buf = reader.bytes();
                        break;
                    }
                case 11: {
                        message.buf = reader.bytes();
                        break;
                    }
                case 12: {
                        message.pbReserve = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for Text
         * @function getTypeUrl
         * @memberof Msg.Text
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Text.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.Text";
        };

        return Text;
    })();

    Msg.Face = (function() {

        /**
         * Properties of a Face.
         * @memberof Msg
         * @interface IFace
         * @property {number|null} [index] Face index
         * @property {Uint8Array|null} [old] Face old
         * @property {Uint8Array|null} [buf] Face buf
         */

        /**
         * Constructs a new Face.
         * @memberof Msg
         * @classdesc Represents a Face.
         * @implements IFace
         * @constructor
         * @param {Msg.IFace=} [properties] Properties to set
         */
        function Face(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Face index.
         * @member {number|null|undefined} index
         * @memberof Msg.Face
         * @instance
         */
        Face.prototype.index = null;

        /**
         * Face old.
         * @member {Uint8Array|null|undefined} old
         * @memberof Msg.Face
         * @instance
         */
        Face.prototype.old = null;

        /**
         * Face buf.
         * @member {Uint8Array|null|undefined} buf
         * @memberof Msg.Face
         * @instance
         */
        Face.prototype.buf = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Face.prototype, "_index", {
            get: $util.oneOfGetter($oneOfFields = ["index"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Face.prototype, "_old", {
            get: $util.oneOfGetter($oneOfFields = ["old"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Face.prototype, "_buf", {
            get: $util.oneOfGetter($oneOfFields = ["buf"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified Face message. Does not implicitly {@link Msg.Face.verify|verify} messages.
         * @function encode
         * @memberof Msg.Face
         * @static
         * @param {Msg.IFace} message Face message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Face.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.index != null && Object.hasOwnProperty.call(message, "index"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.index);
            if (message.old != null && Object.hasOwnProperty.call(message, "old"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.old);
            if (message.buf != null && Object.hasOwnProperty.call(message, "buf"))
                writer.uint32(/* id 11, wireType 2 =*/90).bytes(message.buf);
            return writer;
        };

        /**
         * Decodes a Face message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.Face
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.Face} Face
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Face.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.Face();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.index = reader.uint32();
                        break;
                    }
                case 2: {
                        message.old = reader.bytes();
                        break;
                    }
                case 11: {
                        message.buf = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for Face
         * @function getTypeUrl
         * @memberof Msg.Face
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Face.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.Face";
        };

        return Face;
    })();

    Msg.LightAppElem = (function() {

        /**
         * Properties of a LightAppElem.
         * @memberof Msg
         * @interface ILightAppElem
         * @property {Uint8Array|null} [data] LightAppElem data
         * @property {Uint8Array|null} [msgResid] LightAppElem msgResid
         */

        /**
         * Constructs a new LightAppElem.
         * @memberof Msg
         * @classdesc Represents a LightAppElem.
         * @implements ILightAppElem
         * @constructor
         * @param {Msg.ILightAppElem=} [properties] Properties to set
         */
        function LightAppElem(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * LightAppElem data.
         * @member {Uint8Array|null|undefined} data
         * @memberof Msg.LightAppElem
         * @instance
         */
        LightAppElem.prototype.data = null;

        /**
         * LightAppElem msgResid.
         * @member {Uint8Array|null|undefined} msgResid
         * @memberof Msg.LightAppElem
         * @instance
         */
        LightAppElem.prototype.msgResid = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(LightAppElem.prototype, "_data", {
            get: $util.oneOfGetter($oneOfFields = ["data"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(LightAppElem.prototype, "_msgResid", {
            get: $util.oneOfGetter($oneOfFields = ["msgResid"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified LightAppElem message. Does not implicitly {@link Msg.LightAppElem.verify|verify} messages.
         * @function encode
         * @memberof Msg.LightAppElem
         * @static
         * @param {Msg.ILightAppElem} message LightAppElem message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LightAppElem.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.data != null && Object.hasOwnProperty.call(message, "data"))
                writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.data);
            if (message.msgResid != null && Object.hasOwnProperty.call(message, "msgResid"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.msgResid);
            return writer;
        };

        /**
         * Decodes a LightAppElem message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.LightAppElem
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.LightAppElem} LightAppElem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LightAppElem.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.LightAppElem();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.data = reader.bytes();
                        break;
                    }
                case 2: {
                        message.msgResid = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for LightAppElem
         * @function getTypeUrl
         * @memberof Msg.LightAppElem
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        LightAppElem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.LightAppElem";
        };

        return LightAppElem;
    })();

    Msg.CommonElem = (function() {

        /**
         * Properties of a CommonElem.
         * @memberof Msg
         * @interface ICommonElem
         * @property {number|null} [serviceType] CommonElem serviceType
         * @property {Uint8Array|null} [pbElem] CommonElem pbElem
         * @property {number|null} [businessType] CommonElem businessType
         */

        /**
         * Constructs a new CommonElem.
         * @memberof Msg
         * @classdesc Represents a CommonElem.
         * @implements ICommonElem
         * @constructor
         * @param {Msg.ICommonElem=} [properties] Properties to set
         */
        function CommonElem(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * CommonElem serviceType.
         * @member {number} serviceType
         * @memberof Msg.CommonElem
         * @instance
         */
        CommonElem.prototype.serviceType = 0;

        /**
         * CommonElem pbElem.
         * @member {Uint8Array|null|undefined} pbElem
         * @memberof Msg.CommonElem
         * @instance
         */
        CommonElem.prototype.pbElem = null;

        /**
         * CommonElem businessType.
         * @member {number|null|undefined} businessType
         * @memberof Msg.CommonElem
         * @instance
         */
        CommonElem.prototype.businessType = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(CommonElem.prototype, "_pbElem", {
            get: $util.oneOfGetter($oneOfFields = ["pbElem"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(CommonElem.prototype, "_businessType", {
            get: $util.oneOfGetter($oneOfFields = ["businessType"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified CommonElem message. Does not implicitly {@link Msg.CommonElem.verify|verify} messages.
         * @function encode
         * @memberof Msg.CommonElem
         * @static
         * @param {Msg.ICommonElem} message CommonElem message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        CommonElem.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.serviceType != null && Object.hasOwnProperty.call(message, "serviceType"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.serviceType);
            if (message.pbElem != null && Object.hasOwnProperty.call(message, "pbElem"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.pbElem);
            if (message.businessType != null && Object.hasOwnProperty.call(message, "businessType"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.businessType);
            return writer;
        };

        /**
         * Decodes a CommonElem message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.CommonElem
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.CommonElem} CommonElem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        CommonElem.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.CommonElem();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.serviceType = reader.uint32();
                        break;
                    }
                case 2: {
                        message.pbElem = reader.bytes();
                        break;
                    }
                case 3: {
                        message.businessType = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for CommonElem
         * @function getTypeUrl
         * @memberof Msg.CommonElem
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        CommonElem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.CommonElem";
        };

        return CommonElem;
    })();

    Msg.Attr = (function() {

        /**
         * Properties of an Attr.
         * @memberof Msg
         * @interface IAttr
         * @property {number|null} [codePage] Attr codePage
         * @property {number|null} [time] Attr time
         * @property {number|null} [random] Attr random
         * @property {number|null} [color] Attr color
         * @property {number|null} [size] Attr size
         * @property {number|null} [effect] Attr effect
         * @property {number|null} [charSet] Attr charSet
         * @property {number|null} [pitchAndFamily] Attr pitchAndFamily
         * @property {string|null} [fontName] Attr fontName
         * @property {Uint8Array|null} [reserveData] Attr reserveData
         */

        /**
         * Constructs a new Attr.
         * @memberof Msg
         * @classdesc Represents an Attr.
         * @implements IAttr
         * @constructor
         * @param {Msg.IAttr=} [properties] Properties to set
         */
        function Attr(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Attr codePage.
         * @member {number|null|undefined} codePage
         * @memberof Msg.Attr
         * @instance
         */
        Attr.prototype.codePage = null;

        /**
         * Attr time.
         * @member {number|null|undefined} time
         * @memberof Msg.Attr
         * @instance
         */
        Attr.prototype.time = null;

        /**
         * Attr random.
         * @member {number|null|undefined} random
         * @memberof Msg.Attr
         * @instance
         */
        Attr.prototype.random = null;

        /**
         * Attr color.
         * @member {number|null|undefined} color
         * @memberof Msg.Attr
         * @instance
         */
        Attr.prototype.color = null;

        /**
         * Attr size.
         * @member {number|null|undefined} size
         * @memberof Msg.Attr
         * @instance
         */
        Attr.prototype.size = null;

        /**
         * Attr effect.
         * @member {number|null|undefined} effect
         * @memberof Msg.Attr
         * @instance
         */
        Attr.prototype.effect = null;

        /**
         * Attr charSet.
         * @member {number|null|undefined} charSet
         * @memberof Msg.Attr
         * @instance
         */
        Attr.prototype.charSet = null;

        /**
         * Attr pitchAndFamily.
         * @member {number|null|undefined} pitchAndFamily
         * @memberof Msg.Attr
         * @instance
         */
        Attr.prototype.pitchAndFamily = null;

        /**
         * Attr fontName.
         * @member {string|null|undefined} fontName
         * @memberof Msg.Attr
         * @instance
         */
        Attr.prototype.fontName = null;

        /**
         * Attr reserveData.
         * @member {Uint8Array|null|undefined} reserveData
         * @memberof Msg.Attr
         * @instance
         */
        Attr.prototype.reserveData = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Attr.prototype, "_codePage", {
            get: $util.oneOfGetter($oneOfFields = ["codePage"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Attr.prototype, "_time", {
            get: $util.oneOfGetter($oneOfFields = ["time"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Attr.prototype, "_random", {
            get: $util.oneOfGetter($oneOfFields = ["random"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Attr.prototype, "_color", {
            get: $util.oneOfGetter($oneOfFields = ["color"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Attr.prototype, "_size", {
            get: $util.oneOfGetter($oneOfFields = ["size"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Attr.prototype, "_effect", {
            get: $util.oneOfGetter($oneOfFields = ["effect"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Attr.prototype, "_charSet", {
            get: $util.oneOfGetter($oneOfFields = ["charSet"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Attr.prototype, "_pitchAndFamily", {
            get: $util.oneOfGetter($oneOfFields = ["pitchAndFamily"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Attr.prototype, "_fontName", {
            get: $util.oneOfGetter($oneOfFields = ["fontName"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(Attr.prototype, "_reserveData", {
            get: $util.oneOfGetter($oneOfFields = ["reserveData"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified Attr message. Does not implicitly {@link Msg.Attr.verify|verify} messages.
         * @function encode
         * @memberof Msg.Attr
         * @static
         * @param {Msg.IAttr} message Attr message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Attr.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.codePage != null && Object.hasOwnProperty.call(message, "codePage"))
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.codePage);
            if (message.time != null && Object.hasOwnProperty.call(message, "time"))
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.time);
            if (message.random != null && Object.hasOwnProperty.call(message, "random"))
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.random);
            if (message.color != null && Object.hasOwnProperty.call(message, "color"))
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.color);
            if (message.size != null && Object.hasOwnProperty.call(message, "size"))
                writer.uint32(/* id 5, wireType 0 =*/40).int32(message.size);
            if (message.effect != null && Object.hasOwnProperty.call(message, "effect"))
                writer.uint32(/* id 6, wireType 0 =*/48).int32(message.effect);
            if (message.charSet != null && Object.hasOwnProperty.call(message, "charSet"))
                writer.uint32(/* id 7, wireType 0 =*/56).int32(message.charSet);
            if (message.pitchAndFamily != null && Object.hasOwnProperty.call(message, "pitchAndFamily"))
                writer.uint32(/* id 8, wireType 0 =*/64).int32(message.pitchAndFamily);
            if (message.fontName != null && Object.hasOwnProperty.call(message, "fontName"))
                writer.uint32(/* id 9, wireType 2 =*/74).string(message.fontName);
            if (message.reserveData != null && Object.hasOwnProperty.call(message, "reserveData"))
                writer.uint32(/* id 10, wireType 2 =*/82).bytes(message.reserveData);
            return writer;
        };

        /**
         * Decodes an Attr message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.Attr
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.Attr} Attr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Attr.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.Attr();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.codePage = reader.int32();
                        break;
                    }
                case 2: {
                        message.time = reader.int32();
                        break;
                    }
                case 3: {
                        message.random = reader.int32();
                        break;
                    }
                case 4: {
                        message.color = reader.int32();
                        break;
                    }
                case 5: {
                        message.size = reader.int32();
                        break;
                    }
                case 6: {
                        message.effect = reader.int32();
                        break;
                    }
                case 7: {
                        message.charSet = reader.int32();
                        break;
                    }
                case 8: {
                        message.pitchAndFamily = reader.int32();
                        break;
                    }
                case 9: {
                        message.fontName = reader.string();
                        break;
                    }
                case 10: {
                        message.reserveData = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for Attr
         * @function getTypeUrl
         * @memberof Msg.Attr
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Attr.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.Attr";
        };

        return Attr;
    })();

    Msg.MarkdownElem = (function() {

        /**
         * Properties of a MarkdownElem.
         * @memberof Msg
         * @interface IMarkdownElem
         * @property {string|null} [content] MarkdownElem content
         */

        /**
         * Constructs a new MarkdownElem.
         * @memberof Msg
         * @classdesc Represents a MarkdownElem.
         * @implements IMarkdownElem
         * @constructor
         * @param {Msg.IMarkdownElem=} [properties] Properties to set
         */
        function MarkdownElem(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * MarkdownElem content.
         * @member {string} content
         * @memberof Msg.MarkdownElem
         * @instance
         */
        MarkdownElem.prototype.content = "";

        /**
         * Encodes the specified MarkdownElem message. Does not implicitly {@link Msg.MarkdownElem.verify|verify} messages.
         * @function encode
         * @memberof Msg.MarkdownElem
         * @static
         * @param {Msg.IMarkdownElem} message MarkdownElem message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        MarkdownElem.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.content != null && Object.hasOwnProperty.call(message, "content"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.content);
            return writer;
        };

        /**
         * Decodes a MarkdownElem message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.MarkdownElem
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.MarkdownElem} MarkdownElem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        MarkdownElem.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.MarkdownElem();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.content = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for MarkdownElem
         * @function getTypeUrl
         * @memberof Msg.MarkdownElem
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        MarkdownElem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.MarkdownElem";
        };

        return MarkdownElem;
    })();

    Msg.PbMultiMsgItem = (function() {

        /**
         * Properties of a PbMultiMsgItem.
         * @memberof Msg
         * @interface IPbMultiMsgItem
         * @property {string|null} [fileName] PbMultiMsgItem fileName
         * @property {Msg.IPbMultiMsgNew|null} [buffer] PbMultiMsgItem buffer
         */

        /**
         * Constructs a new PbMultiMsgItem.
         * @memberof Msg
         * @classdesc Represents a PbMultiMsgItem.
         * @implements IPbMultiMsgItem
         * @constructor
         * @param {Msg.IPbMultiMsgItem=} [properties] Properties to set
         */
        function PbMultiMsgItem(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PbMultiMsgItem fileName.
         * @member {string} fileName
         * @memberof Msg.PbMultiMsgItem
         * @instance
         */
        PbMultiMsgItem.prototype.fileName = "";

        /**
         * PbMultiMsgItem buffer.
         * @member {Msg.IPbMultiMsgNew|null|undefined} buffer
         * @memberof Msg.PbMultiMsgItem
         * @instance
         */
        PbMultiMsgItem.prototype.buffer = null;

        /**
         * Encodes the specified PbMultiMsgItem message. Does not implicitly {@link Msg.PbMultiMsgItem.verify|verify} messages.
         * @function encode
         * @memberof Msg.PbMultiMsgItem
         * @static
         * @param {Msg.IPbMultiMsgItem} message PbMultiMsgItem message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PbMultiMsgItem.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.fileName != null && Object.hasOwnProperty.call(message, "fileName"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.fileName);
            if (message.buffer != null && Object.hasOwnProperty.call(message, "buffer"))
                $root.Msg.PbMultiMsgNew.encode(message.buffer, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a PbMultiMsgItem message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.PbMultiMsgItem
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.PbMultiMsgItem} PbMultiMsgItem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PbMultiMsgItem.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.PbMultiMsgItem();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.fileName = reader.string();
                        break;
                    }
                case 2: {
                        message.buffer = $root.Msg.PbMultiMsgNew.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for PbMultiMsgItem
         * @function getTypeUrl
         * @memberof Msg.PbMultiMsgItem
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PbMultiMsgItem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.PbMultiMsgItem";
        };

        return PbMultiMsgItem;
    })();

    Msg.PbMultiMsgNew = (function() {

        /**
         * Properties of a PbMultiMsgNew.
         * @memberof Msg
         * @interface IPbMultiMsgNew
         * @property {Array.<Msg.IMessage>|null} [msg] PbMultiMsgNew msg
         */

        /**
         * Constructs a new PbMultiMsgNew.
         * @memberof Msg
         * @classdesc Represents a PbMultiMsgNew.
         * @implements IPbMultiMsgNew
         * @constructor
         * @param {Msg.IPbMultiMsgNew=} [properties] Properties to set
         */
        function PbMultiMsgNew(properties) {
            this.msg = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PbMultiMsgNew msg.
         * @member {Array.<Msg.IMessage>} msg
         * @memberof Msg.PbMultiMsgNew
         * @instance
         */
        PbMultiMsgNew.prototype.msg = $util.emptyArray;

        /**
         * Encodes the specified PbMultiMsgNew message. Does not implicitly {@link Msg.PbMultiMsgNew.verify|verify} messages.
         * @function encode
         * @memberof Msg.PbMultiMsgNew
         * @static
         * @param {Msg.IPbMultiMsgNew} message PbMultiMsgNew message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PbMultiMsgNew.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.msg != null && message.msg.length)
                for (let i = 0; i < message.msg.length; ++i)
                    $root.Msg.Message.encode(message.msg[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a PbMultiMsgNew message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.PbMultiMsgNew
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.PbMultiMsgNew} PbMultiMsgNew
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PbMultiMsgNew.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.PbMultiMsgNew();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.msg && message.msg.length))
                            message.msg = [];
                        message.msg.push($root.Msg.Message.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for PbMultiMsgNew
         * @function getTypeUrl
         * @memberof Msg.PbMultiMsgNew
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PbMultiMsgNew.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.PbMultiMsgNew";
        };

        return PbMultiMsgNew;
    })();

    Msg.PbMultiMsgTransmit = (function() {

        /**
         * Properties of a PbMultiMsgTransmit.
         * @memberof Msg
         * @interface IPbMultiMsgTransmit
         * @property {Array.<Msg.IMessage>|null} [msg] PbMultiMsgTransmit msg
         * @property {Array.<Msg.IPbMultiMsgItem>|null} [pbItemList] PbMultiMsgTransmit pbItemList
         */

        /**
         * Constructs a new PbMultiMsgTransmit.
         * @memberof Msg
         * @classdesc Represents a PbMultiMsgTransmit.
         * @implements IPbMultiMsgTransmit
         * @constructor
         * @param {Msg.IPbMultiMsgTransmit=} [properties] Properties to set
         */
        function PbMultiMsgTransmit(properties) {
            this.msg = [];
            this.pbItemList = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PbMultiMsgTransmit msg.
         * @member {Array.<Msg.IMessage>} msg
         * @memberof Msg.PbMultiMsgTransmit
         * @instance
         */
        PbMultiMsgTransmit.prototype.msg = $util.emptyArray;

        /**
         * PbMultiMsgTransmit pbItemList.
         * @member {Array.<Msg.IPbMultiMsgItem>} pbItemList
         * @memberof Msg.PbMultiMsgTransmit
         * @instance
         */
        PbMultiMsgTransmit.prototype.pbItemList = $util.emptyArray;

        /**
         * Encodes the specified PbMultiMsgTransmit message. Does not implicitly {@link Msg.PbMultiMsgTransmit.verify|verify} messages.
         * @function encode
         * @memberof Msg.PbMultiMsgTransmit
         * @static
         * @param {Msg.IPbMultiMsgTransmit} message PbMultiMsgTransmit message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PbMultiMsgTransmit.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.msg != null && message.msg.length)
                for (let i = 0; i < message.msg.length; ++i)
                    $root.Msg.Message.encode(message.msg[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.pbItemList != null && message.pbItemList.length)
                for (let i = 0; i < message.pbItemList.length; ++i)
                    $root.Msg.PbMultiMsgItem.encode(message.pbItemList[i], writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a PbMultiMsgTransmit message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.PbMultiMsgTransmit
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.PbMultiMsgTransmit} PbMultiMsgTransmit
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PbMultiMsgTransmit.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.PbMultiMsgTransmit();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.msg && message.msg.length))
                            message.msg = [];
                        message.msg.push($root.Msg.Message.decode(reader, reader.uint32()));
                        break;
                    }
                case 2: {
                        if (!(message.pbItemList && message.pbItemList.length))
                            message.pbItemList = [];
                        message.pbItemList.push($root.Msg.PbMultiMsgItem.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for PbMultiMsgTransmit
         * @function getTypeUrl
         * @memberof Msg.PbMultiMsgTransmit
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PbMultiMsgTransmit.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.PbMultiMsgTransmit";
        };

        return PbMultiMsgTransmit;
    })();

    Msg.SendMsgRsp = (function() {

        /**
         * Properties of a SendMsgRsp.
         * @memberof Msg
         * @interface ISendMsgRsp
         * @property {number|null} [retCode] SendMsgRsp retCode
         * @property {string|null} [errMsg] SendMsgRsp errMsg
         * @property {number|null} [groupSeq] SendMsgRsp groupSeq
         * @property {number|null} [timestamp] SendMsgRsp timestamp
         * @property {number|null} [privateSeq] SendMsgRsp privateSeq
         */

        /**
         * Constructs a new SendMsgRsp.
         * @memberof Msg
         * @classdesc Represents a SendMsgRsp.
         * @implements ISendMsgRsp
         * @constructor
         * @param {Msg.ISendMsgRsp=} [properties] Properties to set
         */
        function SendMsgRsp(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SendMsgRsp retCode.
         * @member {number} retCode
         * @memberof Msg.SendMsgRsp
         * @instance
         */
        SendMsgRsp.prototype.retCode = 0;

        /**
         * SendMsgRsp errMsg.
         * @member {string|null|undefined} errMsg
         * @memberof Msg.SendMsgRsp
         * @instance
         */
        SendMsgRsp.prototype.errMsg = null;

        /**
         * SendMsgRsp groupSeq.
         * @member {number|null|undefined} groupSeq
         * @memberof Msg.SendMsgRsp
         * @instance
         */
        SendMsgRsp.prototype.groupSeq = null;

        /**
         * SendMsgRsp timestamp.
         * @member {number|null|undefined} timestamp
         * @memberof Msg.SendMsgRsp
         * @instance
         */
        SendMsgRsp.prototype.timestamp = null;

        /**
         * SendMsgRsp privateSeq.
         * @member {number|null|undefined} privateSeq
         * @memberof Msg.SendMsgRsp
         * @instance
         */
        SendMsgRsp.prototype.privateSeq = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(SendMsgRsp.prototype, "_errMsg", {
            get: $util.oneOfGetter($oneOfFields = ["errMsg"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(SendMsgRsp.prototype, "_groupSeq", {
            get: $util.oneOfGetter($oneOfFields = ["groupSeq"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(SendMsgRsp.prototype, "_timestamp", {
            get: $util.oneOfGetter($oneOfFields = ["timestamp"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        // Virtual OneOf for proto3 optional field
        Object.defineProperty(SendMsgRsp.prototype, "_privateSeq", {
            get: $util.oneOfGetter($oneOfFields = ["privateSeq"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Encodes the specified SendMsgRsp message. Does not implicitly {@link Msg.SendMsgRsp.verify|verify} messages.
         * @function encode
         * @memberof Msg.SendMsgRsp
         * @static
         * @param {Msg.ISendMsgRsp} message SendMsgRsp message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SendMsgRsp.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.retCode != null && Object.hasOwnProperty.call(message, "retCode"))
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.retCode);
            if (message.errMsg != null && Object.hasOwnProperty.call(message, "errMsg"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.errMsg);
            if (message.groupSeq != null && Object.hasOwnProperty.call(message, "groupSeq"))
                writer.uint32(/* id 11, wireType 0 =*/88).int32(message.groupSeq);
            if (message.timestamp != null && Object.hasOwnProperty.call(message, "timestamp"))
                writer.uint32(/* id 12, wireType 0 =*/96).uint32(message.timestamp);
            if (message.privateSeq != null && Object.hasOwnProperty.call(message, "privateSeq"))
                writer.uint32(/* id 14, wireType 0 =*/112).int32(message.privateSeq);
            return writer;
        };

        /**
         * Decodes a SendMsgRsp message from the specified reader or buffer.
         * @function decode
         * @memberof Msg.SendMsgRsp
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Msg.SendMsgRsp} SendMsgRsp
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SendMsgRsp.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Msg.SendMsgRsp();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.retCode = reader.int32();
                        break;
                    }
                case 2: {
                        message.errMsg = reader.string();
                        break;
                    }
                case 11: {
                        message.groupSeq = reader.int32();
                        break;
                    }
                case 12: {
                        message.timestamp = reader.uint32();
                        break;
                    }
                case 14: {
                        message.privateSeq = reader.int32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for SendMsgRsp
         * @function getTypeUrl
         * @memberof Msg.SendMsgRsp
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        SendMsgRsp.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Msg.SendMsgRsp";
        };

        return SendMsgRsp;
    })();

    return Msg;
})();

export const RichMedia = $root.RichMedia = (() => {

    /**
     * Namespace RichMedia.
     * @exports RichMedia
     * @namespace
     */
    const RichMedia = {};

    RichMedia.MsgInfo = (function() {

        /**
         * Properties of a MsgInfo.
         * @memberof RichMedia
         * @interface IMsgInfo
         * @property {Array.<RichMedia.IMsgInfoBody>|null} [msgInfoBody] MsgInfo msgInfoBody
         * @property {RichMedia.IExtBizInfo|null} [extBizInfo] MsgInfo extBizInfo
         */

        /**
         * Constructs a new MsgInfo.
         * @memberof RichMedia
         * @classdesc Represents a MsgInfo.
         * @implements IMsgInfo
         * @constructor
         * @param {RichMedia.IMsgInfo=} [properties] Properties to set
         */
        function MsgInfo(properties) {
            this.msgInfoBody = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * MsgInfo msgInfoBody.
         * @member {Array.<RichMedia.IMsgInfoBody>} msgInfoBody
         * @memberof RichMedia.MsgInfo
         * @instance
         */
        MsgInfo.prototype.msgInfoBody = $util.emptyArray;

        /**
         * MsgInfo extBizInfo.
         * @member {RichMedia.IExtBizInfo|null|undefined} extBizInfo
         * @memberof RichMedia.MsgInfo
         * @instance
         */
        MsgInfo.prototype.extBizInfo = null;

        /**
         * Encodes the specified MsgInfo message. Does not implicitly {@link RichMedia.MsgInfo.verify|verify} messages.
         * @function encode
         * @memberof RichMedia.MsgInfo
         * @static
         * @param {RichMedia.IMsgInfo} message MsgInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        MsgInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.msgInfoBody != null && message.msgInfoBody.length)
                for (let i = 0; i < message.msgInfoBody.length; ++i)
                    $root.RichMedia.MsgInfoBody.encode(message.msgInfoBody[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.extBizInfo != null && Object.hasOwnProperty.call(message, "extBizInfo"))
                $root.RichMedia.ExtBizInfo.encode(message.extBizInfo, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a MsgInfo message from the specified reader or buffer.
         * @function decode
         * @memberof RichMedia.MsgInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {RichMedia.MsgInfo} MsgInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        MsgInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.RichMedia.MsgInfo();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.msgInfoBody && message.msgInfoBody.length))
                            message.msgInfoBody = [];
                        message.msgInfoBody.push($root.RichMedia.MsgInfoBody.decode(reader, reader.uint32()));
                        break;
                    }
                case 2: {
                        message.extBizInfo = $root.RichMedia.ExtBizInfo.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for MsgInfo
         * @function getTypeUrl
         * @memberof RichMedia.MsgInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        MsgInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/RichMedia.MsgInfo";
        };

        return MsgInfo;
    })();

    RichMedia.MsgInfoBody = (function() {

        /**
         * Properties of a MsgInfoBody.
         * @memberof RichMedia
         * @interface IMsgInfoBody
         * @property {RichMedia.IIndexNode|null} [index] MsgInfoBody index
         * @property {RichMedia.IPicInfo|null} [pic] MsgInfoBody pic
         * @property {boolean|null} [fileExist] MsgInfoBody fileExist
         */

        /**
         * Constructs a new MsgInfoBody.
         * @memberof RichMedia
         * @classdesc Represents a MsgInfoBody.
         * @implements IMsgInfoBody
         * @constructor
         * @param {RichMedia.IMsgInfoBody=} [properties] Properties to set
         */
        function MsgInfoBody(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * MsgInfoBody index.
         * @member {RichMedia.IIndexNode|null|undefined} index
         * @memberof RichMedia.MsgInfoBody
         * @instance
         */
        MsgInfoBody.prototype.index = null;

        /**
         * MsgInfoBody pic.
         * @member {RichMedia.IPicInfo|null|undefined} pic
         * @memberof RichMedia.MsgInfoBody
         * @instance
         */
        MsgInfoBody.prototype.pic = null;

        /**
         * MsgInfoBody fileExist.
         * @member {boolean} fileExist
         * @memberof RichMedia.MsgInfoBody
         * @instance
         */
        MsgInfoBody.prototype.fileExist = false;

        /**
         * Encodes the specified MsgInfoBody message. Does not implicitly {@link RichMedia.MsgInfoBody.verify|verify} messages.
         * @function encode
         * @memberof RichMedia.MsgInfoBody
         * @static
         * @param {RichMedia.IMsgInfoBody} message MsgInfoBody message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        MsgInfoBody.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.index != null && Object.hasOwnProperty.call(message, "index"))
                $root.RichMedia.IndexNode.encode(message.index, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.pic != null && Object.hasOwnProperty.call(message, "pic"))
                $root.RichMedia.PicInfo.encode(message.pic, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.fileExist != null && Object.hasOwnProperty.call(message, "fileExist"))
                writer.uint32(/* id 5, wireType 0 =*/40).bool(message.fileExist);
            return writer;
        };

        /**
         * Decodes a MsgInfoBody message from the specified reader or buffer.
         * @function decode
         * @memberof RichMedia.MsgInfoBody
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {RichMedia.MsgInfoBody} MsgInfoBody
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        MsgInfoBody.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.RichMedia.MsgInfoBody();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.index = $root.RichMedia.IndexNode.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.pic = $root.RichMedia.PicInfo.decode(reader, reader.uint32());
                        break;
                    }
                case 5: {
                        message.fileExist = reader.bool();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for MsgInfoBody
         * @function getTypeUrl
         * @memberof RichMedia.MsgInfoBody
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        MsgInfoBody.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/RichMedia.MsgInfoBody";
        };

        return MsgInfoBody;
    })();

    RichMedia.IndexNode = (function() {

        /**
         * Properties of an IndexNode.
         * @memberof RichMedia
         * @interface IIndexNode
         * @property {RichMedia.IFileInfo|null} [info] IndexNode info
         * @property {string|null} [fileUuid] IndexNode fileUuid
         * @property {number|null} [storeID] IndexNode storeID
         * @property {number|null} [uploadTime] IndexNode uploadTime
         * @property {number|null} [expire] IndexNode expire
         * @property {number|null} [type] IndexNode type
         */

        /**
         * Constructs a new IndexNode.
         * @memberof RichMedia
         * @classdesc Represents an IndexNode.
         * @implements IIndexNode
         * @constructor
         * @param {RichMedia.IIndexNode=} [properties] Properties to set
         */
        function IndexNode(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * IndexNode info.
         * @member {RichMedia.IFileInfo|null|undefined} info
         * @memberof RichMedia.IndexNode
         * @instance
         */
        IndexNode.prototype.info = null;

        /**
         * IndexNode fileUuid.
         * @member {string} fileUuid
         * @memberof RichMedia.IndexNode
         * @instance
         */
        IndexNode.prototype.fileUuid = "";

        /**
         * IndexNode storeID.
         * @member {number} storeID
         * @memberof RichMedia.IndexNode
         * @instance
         */
        IndexNode.prototype.storeID = 0;

        /**
         * IndexNode uploadTime.
         * @member {number} uploadTime
         * @memberof RichMedia.IndexNode
         * @instance
         */
        IndexNode.prototype.uploadTime = 0;

        /**
         * IndexNode expire.
         * @member {number} expire
         * @memberof RichMedia.IndexNode
         * @instance
         */
        IndexNode.prototype.expire = 0;

        /**
         * IndexNode type.
         * @member {number} type
         * @memberof RichMedia.IndexNode
         * @instance
         */
        IndexNode.prototype.type = 0;

        /**
         * Encodes the specified IndexNode message. Does not implicitly {@link RichMedia.IndexNode.verify|verify} messages.
         * @function encode
         * @memberof RichMedia.IndexNode
         * @static
         * @param {RichMedia.IIndexNode} message IndexNode message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        IndexNode.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.info != null && Object.hasOwnProperty.call(message, "info"))
                $root.RichMedia.FileInfo.encode(message.info, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.fileUuid != null && Object.hasOwnProperty.call(message, "fileUuid"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.fileUuid);
            if (message.storeID != null && Object.hasOwnProperty.call(message, "storeID"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.storeID);
            if (message.uploadTime != null && Object.hasOwnProperty.call(message, "uploadTime"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.uploadTime);
            if (message.expire != null && Object.hasOwnProperty.call(message, "expire"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.expire);
            if (message.type != null && Object.hasOwnProperty.call(message, "type"))
                writer.uint32(/* id 6, wireType 0 =*/48).uint32(message.type);
            return writer;
        };

        /**
         * Decodes an IndexNode message from the specified reader or buffer.
         * @function decode
         * @memberof RichMedia.IndexNode
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {RichMedia.IndexNode} IndexNode
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        IndexNode.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.RichMedia.IndexNode();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.info = $root.RichMedia.FileInfo.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.fileUuid = reader.string();
                        break;
                    }
                case 3: {
                        message.storeID = reader.uint32();
                        break;
                    }
                case 4: {
                        message.uploadTime = reader.uint32();
                        break;
                    }
                case 5: {
                        message.expire = reader.uint32();
                        break;
                    }
                case 6: {
                        message.type = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for IndexNode
         * @function getTypeUrl
         * @memberof RichMedia.IndexNode
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        IndexNode.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/RichMedia.IndexNode";
        };

        return IndexNode;
    })();

    RichMedia.FileInfo = (function() {

        /**
         * Properties of a FileInfo.
         * @memberof RichMedia
         * @interface IFileInfo
         * @property {number|null} [fileSize] FileInfo fileSize
         * @property {string|null} [md5HexStr] FileInfo md5HexStr
         * @property {string|null} [sha1HexStr] FileInfo sha1HexStr
         * @property {string|null} [fileName] FileInfo fileName
         * @property {RichMedia.IFileType|null} [fileType] FileInfo fileType
         * @property {number|null} [width] FileInfo width
         * @property {number|null} [height] FileInfo height
         * @property {number|null} [time] FileInfo time
         * @property {number|null} [original] FileInfo original
         */

        /**
         * Constructs a new FileInfo.
         * @memberof RichMedia
         * @classdesc Represents a FileInfo.
         * @implements IFileInfo
         * @constructor
         * @param {RichMedia.IFileInfo=} [properties] Properties to set
         */
        function FileInfo(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * FileInfo fileSize.
         * @member {number} fileSize
         * @memberof RichMedia.FileInfo
         * @instance
         */
        FileInfo.prototype.fileSize = 0;

        /**
         * FileInfo md5HexStr.
         * @member {string} md5HexStr
         * @memberof RichMedia.FileInfo
         * @instance
         */
        FileInfo.prototype.md5HexStr = "";

        /**
         * FileInfo sha1HexStr.
         * @member {string} sha1HexStr
         * @memberof RichMedia.FileInfo
         * @instance
         */
        FileInfo.prototype.sha1HexStr = "";

        /**
         * FileInfo fileName.
         * @member {string} fileName
         * @memberof RichMedia.FileInfo
         * @instance
         */
        FileInfo.prototype.fileName = "";

        /**
         * FileInfo fileType.
         * @member {RichMedia.IFileType|null|undefined} fileType
         * @memberof RichMedia.FileInfo
         * @instance
         */
        FileInfo.prototype.fileType = null;

        /**
         * FileInfo width.
         * @member {number} width
         * @memberof RichMedia.FileInfo
         * @instance
         */
        FileInfo.prototype.width = 0;

        /**
         * FileInfo height.
         * @member {number} height
         * @memberof RichMedia.FileInfo
         * @instance
         */
        FileInfo.prototype.height = 0;

        /**
         * FileInfo time.
         * @member {number} time
         * @memberof RichMedia.FileInfo
         * @instance
         */
        FileInfo.prototype.time = 0;

        /**
         * FileInfo original.
         * @member {number} original
         * @memberof RichMedia.FileInfo
         * @instance
         */
        FileInfo.prototype.original = 0;

        /**
         * Encodes the specified FileInfo message. Does not implicitly {@link RichMedia.FileInfo.verify|verify} messages.
         * @function encode
         * @memberof RichMedia.FileInfo
         * @static
         * @param {RichMedia.IFileInfo} message FileInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FileInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.fileSize != null && Object.hasOwnProperty.call(message, "fileSize"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.fileSize);
            if (message.md5HexStr != null && Object.hasOwnProperty.call(message, "md5HexStr"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.md5HexStr);
            if (message.sha1HexStr != null && Object.hasOwnProperty.call(message, "sha1HexStr"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.sha1HexStr);
            if (message.fileName != null && Object.hasOwnProperty.call(message, "fileName"))
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.fileName);
            if (message.fileType != null && Object.hasOwnProperty.call(message, "fileType"))
                $root.RichMedia.FileType.encode(message.fileType, writer.uint32(/* id 5, wireType 2 =*/42).fork()).ldelim();
            if (message.width != null && Object.hasOwnProperty.call(message, "width"))
                writer.uint32(/* id 6, wireType 0 =*/48).uint32(message.width);
            if (message.height != null && Object.hasOwnProperty.call(message, "height"))
                writer.uint32(/* id 7, wireType 0 =*/56).uint32(message.height);
            if (message.time != null && Object.hasOwnProperty.call(message, "time"))
                writer.uint32(/* id 8, wireType 0 =*/64).uint32(message.time);
            if (message.original != null && Object.hasOwnProperty.call(message, "original"))
                writer.uint32(/* id 9, wireType 0 =*/72).uint32(message.original);
            return writer;
        };

        /**
         * Decodes a FileInfo message from the specified reader or buffer.
         * @function decode
         * @memberof RichMedia.FileInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {RichMedia.FileInfo} FileInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FileInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.RichMedia.FileInfo();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.fileSize = reader.uint32();
                        break;
                    }
                case 2: {
                        message.md5HexStr = reader.string();
                        break;
                    }
                case 3: {
                        message.sha1HexStr = reader.string();
                        break;
                    }
                case 4: {
                        message.fileName = reader.string();
                        break;
                    }
                case 5: {
                        message.fileType = $root.RichMedia.FileType.decode(reader, reader.uint32());
                        break;
                    }
                case 6: {
                        message.width = reader.uint32();
                        break;
                    }
                case 7: {
                        message.height = reader.uint32();
                        break;
                    }
                case 8: {
                        message.time = reader.uint32();
                        break;
                    }
                case 9: {
                        message.original = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for FileInfo
         * @function getTypeUrl
         * @memberof RichMedia.FileInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FileInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/RichMedia.FileInfo";
        };

        return FileInfo;
    })();

    RichMedia.FileType = (function() {

        /**
         * Properties of a FileType.
         * @memberof RichMedia
         * @interface IFileType
         * @property {number|null} [type] FileType type
         * @property {number|null} [picFormat] FileType picFormat
         * @property {number|null} [videoFormat] FileType videoFormat
         * @property {number|null} [pttFormat] FileType pttFormat
         */

        /**
         * Constructs a new FileType.
         * @memberof RichMedia
         * @classdesc Represents a FileType.
         * @implements IFileType
         * @constructor
         * @param {RichMedia.IFileType=} [properties] Properties to set
         */
        function FileType(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * FileType type.
         * @member {number} type
         * @memberof RichMedia.FileType
         * @instance
         */
        FileType.prototype.type = 0;

        /**
         * FileType picFormat.
         * @member {number} picFormat
         * @memberof RichMedia.FileType
         * @instance
         */
        FileType.prototype.picFormat = 0;

        /**
         * FileType videoFormat.
         * @member {number} videoFormat
         * @memberof RichMedia.FileType
         * @instance
         */
        FileType.prototype.videoFormat = 0;

        /**
         * FileType pttFormat.
         * @member {number} pttFormat
         * @memberof RichMedia.FileType
         * @instance
         */
        FileType.prototype.pttFormat = 0;

        /**
         * Encodes the specified FileType message. Does not implicitly {@link RichMedia.FileType.verify|verify} messages.
         * @function encode
         * @memberof RichMedia.FileType
         * @static
         * @param {RichMedia.IFileType} message FileType message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FileType.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.type != null && Object.hasOwnProperty.call(message, "type"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.type);
            if (message.picFormat != null && Object.hasOwnProperty.call(message, "picFormat"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.picFormat);
            if (message.videoFormat != null && Object.hasOwnProperty.call(message, "videoFormat"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.videoFormat);
            if (message.pttFormat != null && Object.hasOwnProperty.call(message, "pttFormat"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.pttFormat);
            return writer;
        };

        /**
         * Decodes a FileType message from the specified reader or buffer.
         * @function decode
         * @memberof RichMedia.FileType
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {RichMedia.FileType} FileType
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FileType.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.RichMedia.FileType();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.type = reader.uint32();
                        break;
                    }
                case 2: {
                        message.picFormat = reader.uint32();
                        break;
                    }
                case 3: {
                        message.videoFormat = reader.uint32();
                        break;
                    }
                case 4: {
                        message.pttFormat = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for FileType
         * @function getTypeUrl
         * @memberof RichMedia.FileType
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FileType.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/RichMedia.FileType";
        };

        return FileType;
    })();

    RichMedia.PicInfo = (function() {

        /**
         * Properties of a PicInfo.
         * @memberof RichMedia
         * @interface IPicInfo
         * @property {string|null} [urlPath] PicInfo urlPath
         * @property {RichMedia.IPicUrlExtParams|null} [ext] PicInfo ext
         * @property {string|null} [domain] PicInfo domain
         */

        /**
         * Constructs a new PicInfo.
         * @memberof RichMedia
         * @classdesc Represents a PicInfo.
         * @implements IPicInfo
         * @constructor
         * @param {RichMedia.IPicInfo=} [properties] Properties to set
         */
        function PicInfo(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PicInfo urlPath.
         * @member {string} urlPath
         * @memberof RichMedia.PicInfo
         * @instance
         */
        PicInfo.prototype.urlPath = "";

        /**
         * PicInfo ext.
         * @member {RichMedia.IPicUrlExtParams|null|undefined} ext
         * @memberof RichMedia.PicInfo
         * @instance
         */
        PicInfo.prototype.ext = null;

        /**
         * PicInfo domain.
         * @member {string} domain
         * @memberof RichMedia.PicInfo
         * @instance
         */
        PicInfo.prototype.domain = "";

        /**
         * Encodes the specified PicInfo message. Does not implicitly {@link RichMedia.PicInfo.verify|verify} messages.
         * @function encode
         * @memberof RichMedia.PicInfo
         * @static
         * @param {RichMedia.IPicInfo} message PicInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PicInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.urlPath != null && Object.hasOwnProperty.call(message, "urlPath"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.urlPath);
            if (message.ext != null && Object.hasOwnProperty.call(message, "ext"))
                $root.RichMedia.PicUrlExtParams.encode(message.ext, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.domain != null && Object.hasOwnProperty.call(message, "domain"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.domain);
            return writer;
        };

        /**
         * Decodes a PicInfo message from the specified reader or buffer.
         * @function decode
         * @memberof RichMedia.PicInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {RichMedia.PicInfo} PicInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PicInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.RichMedia.PicInfo();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.urlPath = reader.string();
                        break;
                    }
                case 2: {
                        message.ext = $root.RichMedia.PicUrlExtParams.decode(reader, reader.uint32());
                        break;
                    }
                case 3: {
                        message.domain = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for PicInfo
         * @function getTypeUrl
         * @memberof RichMedia.PicInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PicInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/RichMedia.PicInfo";
        };

        return PicInfo;
    })();

    RichMedia.PicUrlExtParams = (function() {

        /**
         * Properties of a PicUrlExtParams.
         * @memberof RichMedia
         * @interface IPicUrlExtParams
         * @property {string|null} [originalParam] PicUrlExtParams originalParam
         * @property {string|null} [bigParam] PicUrlExtParams bigParam
         * @property {string|null} [thumbParam] PicUrlExtParams thumbParam
         */

        /**
         * Constructs a new PicUrlExtParams.
         * @memberof RichMedia
         * @classdesc Represents a PicUrlExtParams.
         * @implements IPicUrlExtParams
         * @constructor
         * @param {RichMedia.IPicUrlExtParams=} [properties] Properties to set
         */
        function PicUrlExtParams(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PicUrlExtParams originalParam.
         * @member {string} originalParam
         * @memberof RichMedia.PicUrlExtParams
         * @instance
         */
        PicUrlExtParams.prototype.originalParam = "";

        /**
         * PicUrlExtParams bigParam.
         * @member {string} bigParam
         * @memberof RichMedia.PicUrlExtParams
         * @instance
         */
        PicUrlExtParams.prototype.bigParam = "";

        /**
         * PicUrlExtParams thumbParam.
         * @member {string} thumbParam
         * @memberof RichMedia.PicUrlExtParams
         * @instance
         */
        PicUrlExtParams.prototype.thumbParam = "";

        /**
         * Encodes the specified PicUrlExtParams message. Does not implicitly {@link RichMedia.PicUrlExtParams.verify|verify} messages.
         * @function encode
         * @memberof RichMedia.PicUrlExtParams
         * @static
         * @param {RichMedia.IPicUrlExtParams} message PicUrlExtParams message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PicUrlExtParams.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.originalParam != null && Object.hasOwnProperty.call(message, "originalParam"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.originalParam);
            if (message.bigParam != null && Object.hasOwnProperty.call(message, "bigParam"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.bigParam);
            if (message.thumbParam != null && Object.hasOwnProperty.call(message, "thumbParam"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.thumbParam);
            return writer;
        };

        /**
         * Decodes a PicUrlExtParams message from the specified reader or buffer.
         * @function decode
         * @memberof RichMedia.PicUrlExtParams
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {RichMedia.PicUrlExtParams} PicUrlExtParams
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PicUrlExtParams.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.RichMedia.PicUrlExtParams();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.originalParam = reader.string();
                        break;
                    }
                case 2: {
                        message.bigParam = reader.string();
                        break;
                    }
                case 3: {
                        message.thumbParam = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for PicUrlExtParams
         * @function getTypeUrl
         * @memberof RichMedia.PicUrlExtParams
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PicUrlExtParams.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/RichMedia.PicUrlExtParams";
        };

        return PicUrlExtParams;
    })();

    RichMedia.ExtBizInfo = (function() {

        /**
         * Properties of an ExtBizInfo.
         * @memberof RichMedia
         * @interface IExtBizInfo
         * @property {RichMedia.IPicExtBizInfo|null} [pic] ExtBizInfo pic
         * @property {RichMedia.IVideoExtBizInfo|null} [video] ExtBizInfo video
         * @property {number|null} [busiType] ExtBizInfo busiType
         */

        /**
         * Constructs a new ExtBizInfo.
         * @memberof RichMedia
         * @classdesc Represents an ExtBizInfo.
         * @implements IExtBizInfo
         * @constructor
         * @param {RichMedia.IExtBizInfo=} [properties] Properties to set
         */
        function ExtBizInfo(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * ExtBizInfo pic.
         * @member {RichMedia.IPicExtBizInfo|null|undefined} pic
         * @memberof RichMedia.ExtBizInfo
         * @instance
         */
        ExtBizInfo.prototype.pic = null;

        /**
         * ExtBizInfo video.
         * @member {RichMedia.IVideoExtBizInfo|null|undefined} video
         * @memberof RichMedia.ExtBizInfo
         * @instance
         */
        ExtBizInfo.prototype.video = null;

        /**
         * ExtBizInfo busiType.
         * @member {number} busiType
         * @memberof RichMedia.ExtBizInfo
         * @instance
         */
        ExtBizInfo.prototype.busiType = 0;

        /**
         * Encodes the specified ExtBizInfo message. Does not implicitly {@link RichMedia.ExtBizInfo.verify|verify} messages.
         * @function encode
         * @memberof RichMedia.ExtBizInfo
         * @static
         * @param {RichMedia.IExtBizInfo} message ExtBizInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ExtBizInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.pic != null && Object.hasOwnProperty.call(message, "pic"))
                $root.RichMedia.PicExtBizInfo.encode(message.pic, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.video != null && Object.hasOwnProperty.call(message, "video"))
                $root.RichMedia.VideoExtBizInfo.encode(message.video, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.busiType != null && Object.hasOwnProperty.call(message, "busiType"))
                writer.uint32(/* id 10, wireType 0 =*/80).uint32(message.busiType);
            return writer;
        };

        /**
         * Decodes an ExtBizInfo message from the specified reader or buffer.
         * @function decode
         * @memberof RichMedia.ExtBizInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {RichMedia.ExtBizInfo} ExtBizInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ExtBizInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.RichMedia.ExtBizInfo();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.pic = $root.RichMedia.PicExtBizInfo.decode(reader, reader.uint32());
                        break;
                    }
                case 2: {
                        message.video = $root.RichMedia.VideoExtBizInfo.decode(reader, reader.uint32());
                        break;
                    }
                case 10: {
                        message.busiType = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for ExtBizInfo
         * @function getTypeUrl
         * @memberof RichMedia.ExtBizInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        ExtBizInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/RichMedia.ExtBizInfo";
        };

        return ExtBizInfo;
    })();

    RichMedia.PicExtBizInfo = (function() {

        /**
         * Properties of a PicExtBizInfo.
         * @memberof RichMedia
         * @interface IPicExtBizInfo
         * @property {number|null} [bizType] PicExtBizInfo bizType
         * @property {string|null} [summary] PicExtBizInfo summary
         */

        /**
         * Constructs a new PicExtBizInfo.
         * @memberof RichMedia
         * @classdesc Represents a PicExtBizInfo.
         * @implements IPicExtBizInfo
         * @constructor
         * @param {RichMedia.IPicExtBizInfo=} [properties] Properties to set
         */
        function PicExtBizInfo(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PicExtBizInfo bizType.
         * @member {number} bizType
         * @memberof RichMedia.PicExtBizInfo
         * @instance
         */
        PicExtBizInfo.prototype.bizType = 0;

        /**
         * PicExtBizInfo summary.
         * @member {string} summary
         * @memberof RichMedia.PicExtBizInfo
         * @instance
         */
        PicExtBizInfo.prototype.summary = "";

        /**
         * Encodes the specified PicExtBizInfo message. Does not implicitly {@link RichMedia.PicExtBizInfo.verify|verify} messages.
         * @function encode
         * @memberof RichMedia.PicExtBizInfo
         * @static
         * @param {RichMedia.IPicExtBizInfo} message PicExtBizInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PicExtBizInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.bizType != null && Object.hasOwnProperty.call(message, "bizType"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.bizType);
            if (message.summary != null && Object.hasOwnProperty.call(message, "summary"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.summary);
            return writer;
        };

        /**
         * Decodes a PicExtBizInfo message from the specified reader or buffer.
         * @function decode
         * @memberof RichMedia.PicExtBizInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {RichMedia.PicExtBizInfo} PicExtBizInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PicExtBizInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.RichMedia.PicExtBizInfo();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.bizType = reader.uint32();
                        break;
                    }
                case 2: {
                        message.summary = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for PicExtBizInfo
         * @function getTypeUrl
         * @memberof RichMedia.PicExtBizInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PicExtBizInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/RichMedia.PicExtBizInfo";
        };

        return PicExtBizInfo;
    })();

    RichMedia.VideoExtBizInfo = (function() {

        /**
         * Properties of a VideoExtBizInfo.
         * @memberof RichMedia
         * @interface IVideoExtBizInfo
         * @property {Uint8Array|null} [pbReserve] VideoExtBizInfo pbReserve
         */

        /**
         * Constructs a new VideoExtBizInfo.
         * @memberof RichMedia
         * @classdesc Represents a VideoExtBizInfo.
         * @implements IVideoExtBizInfo
         * @constructor
         * @param {RichMedia.IVideoExtBizInfo=} [properties] Properties to set
         */
        function VideoExtBizInfo(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * VideoExtBizInfo pbReserve.
         * @member {Uint8Array} pbReserve
         * @memberof RichMedia.VideoExtBizInfo
         * @instance
         */
        VideoExtBizInfo.prototype.pbReserve = $util.newBuffer([]);

        /**
         * Encodes the specified VideoExtBizInfo message. Does not implicitly {@link RichMedia.VideoExtBizInfo.verify|verify} messages.
         * @function encode
         * @memberof RichMedia.VideoExtBizInfo
         * @static
         * @param {RichMedia.IVideoExtBizInfo} message VideoExtBizInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        VideoExtBizInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.pbReserve != null && Object.hasOwnProperty.call(message, "pbReserve"))
                writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.pbReserve);
            return writer;
        };

        /**
         * Decodes a VideoExtBizInfo message from the specified reader or buffer.
         * @function decode
         * @memberof RichMedia.VideoExtBizInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {RichMedia.VideoExtBizInfo} VideoExtBizInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        VideoExtBizInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.RichMedia.VideoExtBizInfo();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 3: {
                        message.pbReserve = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for VideoExtBizInfo
         * @function getTypeUrl
         * @memberof RichMedia.VideoExtBizInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        VideoExtBizInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/RichMedia.VideoExtBizInfo";
        };

        return VideoExtBizInfo;
    })();

    RichMedia.PicFileIdInfo = (function() {

        /**
         * Properties of a PicFileIdInfo.
         * @memberof RichMedia
         * @interface IPicFileIdInfo
         * @property {Uint8Array|null} [sha1] PicFileIdInfo sha1
         * @property {number|null} [size] PicFileIdInfo size
         * @property {number|null} [appid] PicFileIdInfo appid
         * @property {number|null} [time] PicFileIdInfo time
         * @property {number|null} [expire] PicFileIdInfo expire
         */

        /**
         * Constructs a new PicFileIdInfo.
         * @memberof RichMedia
         * @classdesc Represents a PicFileIdInfo.
         * @implements IPicFileIdInfo
         * @constructor
         * @param {RichMedia.IPicFileIdInfo=} [properties] Properties to set
         */
        function PicFileIdInfo(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PicFileIdInfo sha1.
         * @member {Uint8Array} sha1
         * @memberof RichMedia.PicFileIdInfo
         * @instance
         */
        PicFileIdInfo.prototype.sha1 = $util.newBuffer([]);

        /**
         * PicFileIdInfo size.
         * @member {number} size
         * @memberof RichMedia.PicFileIdInfo
         * @instance
         */
        PicFileIdInfo.prototype.size = 0;

        /**
         * PicFileIdInfo appid.
         * @member {number} appid
         * @memberof RichMedia.PicFileIdInfo
         * @instance
         */
        PicFileIdInfo.prototype.appid = 0;

        /**
         * PicFileIdInfo time.
         * @member {number} time
         * @memberof RichMedia.PicFileIdInfo
         * @instance
         */
        PicFileIdInfo.prototype.time = 0;

        /**
         * PicFileIdInfo expire.
         * @member {number} expire
         * @memberof RichMedia.PicFileIdInfo
         * @instance
         */
        PicFileIdInfo.prototype.expire = 0;

        /**
         * Encodes the specified PicFileIdInfo message. Does not implicitly {@link RichMedia.PicFileIdInfo.verify|verify} messages.
         * @function encode
         * @memberof RichMedia.PicFileIdInfo
         * @static
         * @param {RichMedia.IPicFileIdInfo} message PicFileIdInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PicFileIdInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.sha1 != null && Object.hasOwnProperty.call(message, "sha1"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.sha1);
            if (message.size != null && Object.hasOwnProperty.call(message, "size"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.size);
            if (message.appid != null && Object.hasOwnProperty.call(message, "appid"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.appid);
            if (message.time != null && Object.hasOwnProperty.call(message, "time"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.time);
            if (message.expire != null && Object.hasOwnProperty.call(message, "expire"))
                writer.uint32(/* id 10, wireType 0 =*/80).uint32(message.expire);
            return writer;
        };

        /**
         * Decodes a PicFileIdInfo message from the specified reader or buffer.
         * @function decode
         * @memberof RichMedia.PicFileIdInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {RichMedia.PicFileIdInfo} PicFileIdInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PicFileIdInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.RichMedia.PicFileIdInfo();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 2: {
                        message.sha1 = reader.bytes();
                        break;
                    }
                case 3: {
                        message.size = reader.uint32();
                        break;
                    }
                case 4: {
                        message.appid = reader.uint32();
                        break;
                    }
                case 5: {
                        message.time = reader.uint32();
                        break;
                    }
                case 10: {
                        message.expire = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for PicFileIdInfo
         * @function getTypeUrl
         * @memberof RichMedia.PicFileIdInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PicFileIdInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/RichMedia.PicFileIdInfo";
        };

        return PicFileIdInfo;
    })();

    return RichMedia;
})();

export const Oidb = $root.Oidb = (() => {

    /**
     * Namespace Oidb.
     * @exports Oidb
     * @namespace
     */
    const Oidb = {};

    Oidb.Base = (function() {

        /**
         * Properties of a Base.
         * @memberof Oidb
         * @interface IBase
         * @property {number|null} [command] Base command
         * @property {number|null} [subCommand] Base subCommand
         * @property {number|null} [errorCode] Base errorCode
         * @property {Uint8Array|null} [body] Base body
         * @property {string|null} [errorMsg] Base errorMsg
         * @property {number|null} [isReserved] Base isReserved
         */

        /**
         * Constructs a new Base.
         * @memberof Oidb
         * @classdesc Represents a Base.
         * @implements IBase
         * @constructor
         * @param {Oidb.IBase=} [properties] Properties to set
         */
        function Base(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * Base command.
         * @member {number} command
         * @memberof Oidb.Base
         * @instance
         */
        Base.prototype.command = 0;

        /**
         * Base subCommand.
         * @member {number} subCommand
         * @memberof Oidb.Base
         * @instance
         */
        Base.prototype.subCommand = 0;

        /**
         * Base errorCode.
         * @member {number} errorCode
         * @memberof Oidb.Base
         * @instance
         */
        Base.prototype.errorCode = 0;

        /**
         * Base body.
         * @member {Uint8Array} body
         * @memberof Oidb.Base
         * @instance
         */
        Base.prototype.body = $util.newBuffer([]);

        /**
         * Base errorMsg.
         * @member {string} errorMsg
         * @memberof Oidb.Base
         * @instance
         */
        Base.prototype.errorMsg = "";

        /**
         * Base isReserved.
         * @member {number} isReserved
         * @memberof Oidb.Base
         * @instance
         */
        Base.prototype.isReserved = 0;

        /**
         * Encodes the specified Base message. Does not implicitly {@link Oidb.Base.verify|verify} messages.
         * @function encode
         * @memberof Oidb.Base
         * @static
         * @param {Oidb.IBase} message Base message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Base.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.command != null && Object.hasOwnProperty.call(message, "command"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.command);
            if (message.subCommand != null && Object.hasOwnProperty.call(message, "subCommand"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.subCommand);
            if (message.errorCode != null && Object.hasOwnProperty.call(message, "errorCode"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.errorCode);
            if (message.body != null && Object.hasOwnProperty.call(message, "body"))
                writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.body);
            if (message.errorMsg != null && Object.hasOwnProperty.call(message, "errorMsg"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.errorMsg);
            if (message.isReserved != null && Object.hasOwnProperty.call(message, "isReserved"))
                writer.uint32(/* id 12, wireType 0 =*/96).uint32(message.isReserved);
            return writer;
        };

        /**
         * Decodes a Base message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.Base
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.Base} Base
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Base.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.Base();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.command = reader.uint32();
                        break;
                    }
                case 2: {
                        message.subCommand = reader.uint32();
                        break;
                    }
                case 3: {
                        message.errorCode = reader.uint32();
                        break;
                    }
                case 4: {
                        message.body = reader.bytes();
                        break;
                    }
                case 5: {
                        message.errorMsg = reader.string();
                        break;
                    }
                case 12: {
                        message.isReserved = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for Base
         * @function getTypeUrl
         * @memberof Oidb.Base
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        Base.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.Base";
        };

        return Base;
    })();

    Oidb.SendPoke = (function() {

        /**
         * Properties of a SendPoke.
         * @memberof Oidb
         * @interface ISendPoke
         * @property {number|null} [toUin] SendPoke toUin
         * @property {number|null} [groupCode] SendPoke groupCode
         * @property {number|null} [friendUin] SendPoke friendUin
         */

        /**
         * Constructs a new SendPoke.
         * @memberof Oidb
         * @classdesc Represents a SendPoke.
         * @implements ISendPoke
         * @constructor
         * @param {Oidb.ISendPoke=} [properties] Properties to set
         */
        function SendPoke(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SendPoke toUin.
         * @member {number} toUin
         * @memberof Oidb.SendPoke
         * @instance
         */
        SendPoke.prototype.toUin = 0;

        /**
         * SendPoke groupCode.
         * @member {number} groupCode
         * @memberof Oidb.SendPoke
         * @instance
         */
        SendPoke.prototype.groupCode = 0;

        /**
         * SendPoke friendUin.
         * @member {number} friendUin
         * @memberof Oidb.SendPoke
         * @instance
         */
        SendPoke.prototype.friendUin = 0;

        /**
         * Encodes the specified SendPoke message. Does not implicitly {@link Oidb.SendPoke.verify|verify} messages.
         * @function encode
         * @memberof Oidb.SendPoke
         * @static
         * @param {Oidb.ISendPoke} message SendPoke message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SendPoke.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.toUin != null && Object.hasOwnProperty.call(message, "toUin"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.toUin);
            if (message.groupCode != null && Object.hasOwnProperty.call(message, "groupCode"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.groupCode);
            if (message.friendUin != null && Object.hasOwnProperty.call(message, "friendUin"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.friendUin);
            return writer;
        };

        /**
         * Decodes a SendPoke message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.SendPoke
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.SendPoke} SendPoke
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SendPoke.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.SendPoke();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.toUin = reader.uint32();
                        break;
                    }
                case 2: {
                        message.groupCode = reader.uint32();
                        break;
                    }
                case 5: {
                        message.friendUin = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for SendPoke
         * @function getTypeUrl
         * @memberof Oidb.SendPoke
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        SendPoke.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.SendPoke";
        };

        return SendPoke;
    })();

    Oidb.SetSpecialTitleBody = (function() {

        /**
         * Properties of a SetSpecialTitleBody.
         * @memberof Oidb
         * @interface ISetSpecialTitleBody
         * @property {string|null} [targetUid] SetSpecialTitleBody targetUid
         * @property {string|null} [specialTitle] SetSpecialTitleBody specialTitle
         * @property {number|null} [expireTime] SetSpecialTitleBody expireTime
         * @property {string|null} [uidName] SetSpecialTitleBody uidName
         */

        /**
         * Constructs a new SetSpecialTitleBody.
         * @memberof Oidb
         * @classdesc Represents a SetSpecialTitleBody.
         * @implements ISetSpecialTitleBody
         * @constructor
         * @param {Oidb.ISetSpecialTitleBody=} [properties] Properties to set
         */
        function SetSpecialTitleBody(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SetSpecialTitleBody targetUid.
         * @member {string} targetUid
         * @memberof Oidb.SetSpecialTitleBody
         * @instance
         */
        SetSpecialTitleBody.prototype.targetUid = "";

        /**
         * SetSpecialTitleBody specialTitle.
         * @member {string} specialTitle
         * @memberof Oidb.SetSpecialTitleBody
         * @instance
         */
        SetSpecialTitleBody.prototype.specialTitle = "";

        /**
         * SetSpecialTitleBody expireTime.
         * @member {number} expireTime
         * @memberof Oidb.SetSpecialTitleBody
         * @instance
         */
        SetSpecialTitleBody.prototype.expireTime = 0;

        /**
         * SetSpecialTitleBody uidName.
         * @member {string} uidName
         * @memberof Oidb.SetSpecialTitleBody
         * @instance
         */
        SetSpecialTitleBody.prototype.uidName = "";

        /**
         * Encodes the specified SetSpecialTitleBody message. Does not implicitly {@link Oidb.SetSpecialTitleBody.verify|verify} messages.
         * @function encode
         * @memberof Oidb.SetSpecialTitleBody
         * @static
         * @param {Oidb.ISetSpecialTitleBody} message SetSpecialTitleBody message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SetSpecialTitleBody.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.targetUid != null && Object.hasOwnProperty.call(message, "targetUid"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.targetUid);
            if (message.specialTitle != null && Object.hasOwnProperty.call(message, "specialTitle"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.specialTitle);
            if (message.expireTime != null && Object.hasOwnProperty.call(message, "expireTime"))
                writer.uint32(/* id 6, wireType 0 =*/48).int32(message.expireTime);
            if (message.uidName != null && Object.hasOwnProperty.call(message, "uidName"))
                writer.uint32(/* id 7, wireType 2 =*/58).string(message.uidName);
            return writer;
        };

        /**
         * Decodes a SetSpecialTitleBody message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.SetSpecialTitleBody
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.SetSpecialTitleBody} SetSpecialTitleBody
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SetSpecialTitleBody.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.SetSpecialTitleBody();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.targetUid = reader.string();
                        break;
                    }
                case 5: {
                        message.specialTitle = reader.string();
                        break;
                    }
                case 6: {
                        message.expireTime = reader.int32();
                        break;
                    }
                case 7: {
                        message.uidName = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for SetSpecialTitleBody
         * @function getTypeUrl
         * @memberof Oidb.SetSpecialTitleBody
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        SetSpecialTitleBody.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.SetSpecialTitleBody";
        };

        return SetSpecialTitleBody;
    })();

    Oidb.SetSpecialTitle = (function() {

        /**
         * Properties of a SetSpecialTitle.
         * @memberof Oidb
         * @interface ISetSpecialTitle
         * @property {number|null} [groupCode] SetSpecialTitle groupCode
         * @property {Oidb.ISetSpecialTitleBody|null} [body] SetSpecialTitle body
         */

        /**
         * Constructs a new SetSpecialTitle.
         * @memberof Oidb
         * @classdesc Represents a SetSpecialTitle.
         * @implements ISetSpecialTitle
         * @constructor
         * @param {Oidb.ISetSpecialTitle=} [properties] Properties to set
         */
        function SetSpecialTitle(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SetSpecialTitle groupCode.
         * @member {number} groupCode
         * @memberof Oidb.SetSpecialTitle
         * @instance
         */
        SetSpecialTitle.prototype.groupCode = 0;

        /**
         * SetSpecialTitle body.
         * @member {Oidb.ISetSpecialTitleBody|null|undefined} body
         * @memberof Oidb.SetSpecialTitle
         * @instance
         */
        SetSpecialTitle.prototype.body = null;

        /**
         * Encodes the specified SetSpecialTitle message. Does not implicitly {@link Oidb.SetSpecialTitle.verify|verify} messages.
         * @function encode
         * @memberof Oidb.SetSpecialTitle
         * @static
         * @param {Oidb.ISetSpecialTitle} message SetSpecialTitle message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SetSpecialTitle.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.groupCode != null && Object.hasOwnProperty.call(message, "groupCode"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.groupCode);
            if (message.body != null && Object.hasOwnProperty.call(message, "body"))
                $root.Oidb.SetSpecialTitleBody.encode(message.body, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a SetSpecialTitle message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.SetSpecialTitle
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.SetSpecialTitle} SetSpecialTitle
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SetSpecialTitle.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.SetSpecialTitle();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.groupCode = reader.uint32();
                        break;
                    }
                case 3: {
                        message.body = $root.Oidb.SetSpecialTitleBody.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for SetSpecialTitle
         * @function getTypeUrl
         * @memberof Oidb.SetSpecialTitle
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        SetSpecialTitle.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.SetSpecialTitle";
        };

        return SetSpecialTitle;
    })();

    Oidb.GetRKeyResponseItem = (function() {

        /**
         * Properties of a GetRKeyResponseItem.
         * @memberof Oidb
         * @interface IGetRKeyResponseItem
         * @property {string|null} [rkey] GetRKeyResponseItem rkey
         * @property {number|null} [ttlSec] GetRKeyResponseItem ttlSec
         * @property {number|null} [storeId] GetRKeyResponseItem storeId
         * @property {number|null} [createTime] GetRKeyResponseItem createTime
         * @property {number|null} [type] GetRKeyResponseItem type
         */

        /**
         * Constructs a new GetRKeyResponseItem.
         * @memberof Oidb
         * @classdesc Represents a GetRKeyResponseItem.
         * @implements IGetRKeyResponseItem
         * @constructor
         * @param {Oidb.IGetRKeyResponseItem=} [properties] Properties to set
         */
        function GetRKeyResponseItem(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * GetRKeyResponseItem rkey.
         * @member {string} rkey
         * @memberof Oidb.GetRKeyResponseItem
         * @instance
         */
        GetRKeyResponseItem.prototype.rkey = "";

        /**
         * GetRKeyResponseItem ttlSec.
         * @member {number} ttlSec
         * @memberof Oidb.GetRKeyResponseItem
         * @instance
         */
        GetRKeyResponseItem.prototype.ttlSec = 0;

        /**
         * GetRKeyResponseItem storeId.
         * @member {number} storeId
         * @memberof Oidb.GetRKeyResponseItem
         * @instance
         */
        GetRKeyResponseItem.prototype.storeId = 0;

        /**
         * GetRKeyResponseItem createTime.
         * @member {number} createTime
         * @memberof Oidb.GetRKeyResponseItem
         * @instance
         */
        GetRKeyResponseItem.prototype.createTime = 0;

        /**
         * GetRKeyResponseItem type.
         * @member {number} type
         * @memberof Oidb.GetRKeyResponseItem
         * @instance
         */
        GetRKeyResponseItem.prototype.type = 0;

        /**
         * Encodes the specified GetRKeyResponseItem message. Does not implicitly {@link Oidb.GetRKeyResponseItem.verify|verify} messages.
         * @function encode
         * @memberof Oidb.GetRKeyResponseItem
         * @static
         * @param {Oidb.IGetRKeyResponseItem} message GetRKeyResponseItem message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        GetRKeyResponseItem.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.rkey != null && Object.hasOwnProperty.call(message, "rkey"))
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.rkey);
            if (message.ttlSec != null && Object.hasOwnProperty.call(message, "ttlSec"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.ttlSec);
            if (message.storeId != null && Object.hasOwnProperty.call(message, "storeId"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.storeId);
            if (message.createTime != null && Object.hasOwnProperty.call(message, "createTime"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.createTime);
            if (message.type != null && Object.hasOwnProperty.call(message, "type"))
                writer.uint32(/* id 5, wireType 0 =*/40).uint32(message.type);
            return writer;
        };

        /**
         * Decodes a GetRKeyResponseItem message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.GetRKeyResponseItem
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.GetRKeyResponseItem} GetRKeyResponseItem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        GetRKeyResponseItem.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.GetRKeyResponseItem();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.rkey = reader.string();
                        break;
                    }
                case 2: {
                        message.ttlSec = reader.uint32();
                        break;
                    }
                case 3: {
                        message.storeId = reader.uint32();
                        break;
                    }
                case 4: {
                        message.createTime = reader.uint32();
                        break;
                    }
                case 5: {
                        message.type = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for GetRKeyResponseItem
         * @function getTypeUrl
         * @memberof Oidb.GetRKeyResponseItem
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        GetRKeyResponseItem.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.GetRKeyResponseItem";
        };

        return GetRKeyResponseItem;
    })();

    Oidb.GetRKeyResponseItems = (function() {

        /**
         * Properties of a GetRKeyResponseItems.
         * @memberof Oidb
         * @interface IGetRKeyResponseItems
         * @property {Array.<Oidb.IGetRKeyResponseItem>|null} [rkeyItems] GetRKeyResponseItems rkeyItems
         */

        /**
         * Constructs a new GetRKeyResponseItems.
         * @memberof Oidb
         * @classdesc Represents a GetRKeyResponseItems.
         * @implements IGetRKeyResponseItems
         * @constructor
         * @param {Oidb.IGetRKeyResponseItems=} [properties] Properties to set
         */
        function GetRKeyResponseItems(properties) {
            this.rkeyItems = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * GetRKeyResponseItems rkeyItems.
         * @member {Array.<Oidb.IGetRKeyResponseItem>} rkeyItems
         * @memberof Oidb.GetRKeyResponseItems
         * @instance
         */
        GetRKeyResponseItems.prototype.rkeyItems = $util.emptyArray;

        /**
         * Encodes the specified GetRKeyResponseItems message. Does not implicitly {@link Oidb.GetRKeyResponseItems.verify|verify} messages.
         * @function encode
         * @memberof Oidb.GetRKeyResponseItems
         * @static
         * @param {Oidb.IGetRKeyResponseItems} message GetRKeyResponseItems message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        GetRKeyResponseItems.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.rkeyItems != null && message.rkeyItems.length)
                for (let i = 0; i < message.rkeyItems.length; ++i)
                    $root.Oidb.GetRKeyResponseItem.encode(message.rkeyItems[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a GetRKeyResponseItems message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.GetRKeyResponseItems
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.GetRKeyResponseItems} GetRKeyResponseItems
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        GetRKeyResponseItems.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.GetRKeyResponseItems();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.rkeyItems && message.rkeyItems.length))
                            message.rkeyItems = [];
                        message.rkeyItems.push($root.Oidb.GetRKeyResponseItem.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for GetRKeyResponseItems
         * @function getTypeUrl
         * @memberof Oidb.GetRKeyResponseItems
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        GetRKeyResponseItems.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.GetRKeyResponseItems";
        };

        return GetRKeyResponseItems;
    })();

    Oidb.GetRKeyResponseBody = (function() {

        /**
         * Properties of a GetRKeyResponseBody.
         * @memberof Oidb
         * @interface IGetRKeyResponseBody
         * @property {Oidb.IGetRKeyResponseItems|null} [result] GetRKeyResponseBody result
         */

        /**
         * Constructs a new GetRKeyResponseBody.
         * @memberof Oidb
         * @classdesc Represents a GetRKeyResponseBody.
         * @implements IGetRKeyResponseBody
         * @constructor
         * @param {Oidb.IGetRKeyResponseBody=} [properties] Properties to set
         */
        function GetRKeyResponseBody(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * GetRKeyResponseBody result.
         * @member {Oidb.IGetRKeyResponseItems|null|undefined} result
         * @memberof Oidb.GetRKeyResponseBody
         * @instance
         */
        GetRKeyResponseBody.prototype.result = null;

        /**
         * Encodes the specified GetRKeyResponseBody message. Does not implicitly {@link Oidb.GetRKeyResponseBody.verify|verify} messages.
         * @function encode
         * @memberof Oidb.GetRKeyResponseBody
         * @static
         * @param {Oidb.IGetRKeyResponseBody} message GetRKeyResponseBody message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        GetRKeyResponseBody.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.result != null && Object.hasOwnProperty.call(message, "result"))
                $root.Oidb.GetRKeyResponseItems.encode(message.result, writer.uint32(/* id 4, wireType 2 =*/34).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a GetRKeyResponseBody message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.GetRKeyResponseBody
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.GetRKeyResponseBody} GetRKeyResponseBody
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        GetRKeyResponseBody.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.GetRKeyResponseBody();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 4: {
                        message.result = $root.Oidb.GetRKeyResponseItems.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for GetRKeyResponseBody
         * @function getTypeUrl
         * @memberof Oidb.GetRKeyResponseBody
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        GetRKeyResponseBody.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.GetRKeyResponseBody";
        };

        return GetRKeyResponseBody;
    })();

    Oidb.FetchUserInfo = (function() {

        /**
         * Properties of a FetchUserInfo.
         * @memberof Oidb
         * @interface IFetchUserInfo
         * @property {number|null} [uin] FetchUserInfo uin
         * @property {number|null} [field2] FetchUserInfo field2
         * @property {Array.<Oidb.IFetchUserInfoKey>|null} [keys] FetchUserInfo keys
         */

        /**
         * Constructs a new FetchUserInfo.
         * @memberof Oidb
         * @classdesc Represents a FetchUserInfo.
         * @implements IFetchUserInfo
         * @constructor
         * @param {Oidb.IFetchUserInfo=} [properties] Properties to set
         */
        function FetchUserInfo(properties) {
            this.keys = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * FetchUserInfo uin.
         * @member {number} uin
         * @memberof Oidb.FetchUserInfo
         * @instance
         */
        FetchUserInfo.prototype.uin = 0;

        /**
         * FetchUserInfo field2.
         * @member {number} field2
         * @memberof Oidb.FetchUserInfo
         * @instance
         */
        FetchUserInfo.prototype.field2 = 0;

        /**
         * FetchUserInfo keys.
         * @member {Array.<Oidb.IFetchUserInfoKey>} keys
         * @memberof Oidb.FetchUserInfo
         * @instance
         */
        FetchUserInfo.prototype.keys = $util.emptyArray;

        /**
         * Encodes the specified FetchUserInfo message. Does not implicitly {@link Oidb.FetchUserInfo.verify|verify} messages.
         * @function encode
         * @memberof Oidb.FetchUserInfo
         * @static
         * @param {Oidb.IFetchUserInfo} message FetchUserInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FetchUserInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.uin != null && Object.hasOwnProperty.call(message, "uin"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.uin);
            if (message.field2 != null && Object.hasOwnProperty.call(message, "field2"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.field2);
            if (message.keys != null && message.keys.length)
                for (let i = 0; i < message.keys.length; ++i)
                    $root.Oidb.FetchUserInfoKey.encode(message.keys[i], writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a FetchUserInfo message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.FetchUserInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.FetchUserInfo} FetchUserInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FetchUserInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.FetchUserInfo();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.uin = reader.uint32();
                        break;
                    }
                case 2: {
                        message.field2 = reader.uint32();
                        break;
                    }
                case 3: {
                        if (!(message.keys && message.keys.length))
                            message.keys = [];
                        message.keys.push($root.Oidb.FetchUserInfoKey.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for FetchUserInfo
         * @function getTypeUrl
         * @memberof Oidb.FetchUserInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FetchUserInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.FetchUserInfo";
        };

        return FetchUserInfo;
    })();

    Oidb.FetchUserInfoKey = (function() {

        /**
         * Properties of a FetchUserInfoKey.
         * @memberof Oidb
         * @interface IFetchUserInfoKey
         * @property {number|null} [key] FetchUserInfoKey key
         */

        /**
         * Constructs a new FetchUserInfoKey.
         * @memberof Oidb
         * @classdesc Represents a FetchUserInfoKey.
         * @implements IFetchUserInfoKey
         * @constructor
         * @param {Oidb.IFetchUserInfoKey=} [properties] Properties to set
         */
        function FetchUserInfoKey(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * FetchUserInfoKey key.
         * @member {number} key
         * @memberof Oidb.FetchUserInfoKey
         * @instance
         */
        FetchUserInfoKey.prototype.key = 0;

        /**
         * Encodes the specified FetchUserInfoKey message. Does not implicitly {@link Oidb.FetchUserInfoKey.verify|verify} messages.
         * @function encode
         * @memberof Oidb.FetchUserInfoKey
         * @static
         * @param {Oidb.IFetchUserInfoKey} message FetchUserInfoKey message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FetchUserInfoKey.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.key != null && Object.hasOwnProperty.call(message, "key"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.key);
            return writer;
        };

        /**
         * Decodes a FetchUserInfoKey message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.FetchUserInfoKey
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.FetchUserInfoKey} FetchUserInfoKey
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FetchUserInfoKey.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.FetchUserInfoKey();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.key = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for FetchUserInfoKey
         * @function getTypeUrl
         * @memberof Oidb.FetchUserInfoKey
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FetchUserInfoKey.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.FetchUserInfoKey";
        };

        return FetchUserInfoKey;
    })();

    Oidb.FetchUserInfoResponse = (function() {

        /**
         * Properties of a FetchUserInfoResponse.
         * @memberof Oidb
         * @interface IFetchUserInfoResponse
         * @property {Oidb.IFetchUserInfoResponseBody|null} [body] FetchUserInfoResponse body
         */

        /**
         * Constructs a new FetchUserInfoResponse.
         * @memberof Oidb
         * @classdesc Represents a FetchUserInfoResponse.
         * @implements IFetchUserInfoResponse
         * @constructor
         * @param {Oidb.IFetchUserInfoResponse=} [properties] Properties to set
         */
        function FetchUserInfoResponse(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * FetchUserInfoResponse body.
         * @member {Oidb.IFetchUserInfoResponseBody|null|undefined} body
         * @memberof Oidb.FetchUserInfoResponse
         * @instance
         */
        FetchUserInfoResponse.prototype.body = null;

        /**
         * Encodes the specified FetchUserInfoResponse message. Does not implicitly {@link Oidb.FetchUserInfoResponse.verify|verify} messages.
         * @function encode
         * @memberof Oidb.FetchUserInfoResponse
         * @static
         * @param {Oidb.IFetchUserInfoResponse} message FetchUserInfoResponse message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FetchUserInfoResponse.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.body != null && Object.hasOwnProperty.call(message, "body"))
                $root.Oidb.FetchUserInfoResponseBody.encode(message.body, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a FetchUserInfoResponse message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.FetchUserInfoResponse
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.FetchUserInfoResponse} FetchUserInfoResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FetchUserInfoResponse.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.FetchUserInfoResponse();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.body = $root.Oidb.FetchUserInfoResponseBody.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for FetchUserInfoResponse
         * @function getTypeUrl
         * @memberof Oidb.FetchUserInfoResponse
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FetchUserInfoResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.FetchUserInfoResponse";
        };

        return FetchUserInfoResponse;
    })();

    Oidb.FetchUserInfoResponseBody = (function() {

        /**
         * Properties of a FetchUserInfoResponseBody.
         * @memberof Oidb
         * @interface IFetchUserInfoResponseBody
         * @property {Oidb.IFetchUserInfoResponseProperty|null} [properties] FetchUserInfoResponseBody properties
         * @property {number|null} [uin] FetchUserInfoResponseBody uin
         */

        /**
         * Constructs a new FetchUserInfoResponseBody.
         * @memberof Oidb
         * @classdesc Represents a FetchUserInfoResponseBody.
         * @implements IFetchUserInfoResponseBody
         * @constructor
         * @param {Oidb.IFetchUserInfoResponseBody=} [properties] Properties to set
         */
        function FetchUserInfoResponseBody(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * FetchUserInfoResponseBody properties.
         * @member {Oidb.IFetchUserInfoResponseProperty|null|undefined} properties
         * @memberof Oidb.FetchUserInfoResponseBody
         * @instance
         */
        FetchUserInfoResponseBody.prototype.properties = null;

        /**
         * FetchUserInfoResponseBody uin.
         * @member {number} uin
         * @memberof Oidb.FetchUserInfoResponseBody
         * @instance
         */
        FetchUserInfoResponseBody.prototype.uin = 0;

        /**
         * Encodes the specified FetchUserInfoResponseBody message. Does not implicitly {@link Oidb.FetchUserInfoResponseBody.verify|verify} messages.
         * @function encode
         * @memberof Oidb.FetchUserInfoResponseBody
         * @static
         * @param {Oidb.IFetchUserInfoResponseBody} message FetchUserInfoResponseBody message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FetchUserInfoResponseBody.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.properties != null && Object.hasOwnProperty.call(message, "properties"))
                $root.Oidb.FetchUserInfoResponseProperty.encode(message.properties, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.uin != null && Object.hasOwnProperty.call(message, "uin"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.uin);
            return writer;
        };

        /**
         * Decodes a FetchUserInfoResponseBody message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.FetchUserInfoResponseBody
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.FetchUserInfoResponseBody} FetchUserInfoResponseBody
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FetchUserInfoResponseBody.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.FetchUserInfoResponseBody();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 2: {
                        message.properties = $root.Oidb.FetchUserInfoResponseProperty.decode(reader, reader.uint32());
                        break;
                    }
                case 3: {
                        message.uin = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for FetchUserInfoResponseBody
         * @function getTypeUrl
         * @memberof Oidb.FetchUserInfoResponseBody
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FetchUserInfoResponseBody.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.FetchUserInfoResponseBody";
        };

        return FetchUserInfoResponseBody;
    })();

    Oidb.FetchUserInfoResponseProperty = (function() {

        /**
         * Properties of a FetchUserInfoResponseProperty.
         * @memberof Oidb
         * @interface IFetchUserInfoResponseProperty
         * @property {Array.<Oidb.IOidbUserNumberProperty>|null} [numberProperties] FetchUserInfoResponseProperty numberProperties
         * @property {Array.<Oidb.IOidbUserByteProperty>|null} [bytesProperties] FetchUserInfoResponseProperty bytesProperties
         */

        /**
         * Constructs a new FetchUserInfoResponseProperty.
         * @memberof Oidb
         * @classdesc Represents a FetchUserInfoResponseProperty.
         * @implements IFetchUserInfoResponseProperty
         * @constructor
         * @param {Oidb.IFetchUserInfoResponseProperty=} [properties] Properties to set
         */
        function FetchUserInfoResponseProperty(properties) {
            this.numberProperties = [];
            this.bytesProperties = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * FetchUserInfoResponseProperty numberProperties.
         * @member {Array.<Oidb.IOidbUserNumberProperty>} numberProperties
         * @memberof Oidb.FetchUserInfoResponseProperty
         * @instance
         */
        FetchUserInfoResponseProperty.prototype.numberProperties = $util.emptyArray;

        /**
         * FetchUserInfoResponseProperty bytesProperties.
         * @member {Array.<Oidb.IOidbUserByteProperty>} bytesProperties
         * @memberof Oidb.FetchUserInfoResponseProperty
         * @instance
         */
        FetchUserInfoResponseProperty.prototype.bytesProperties = $util.emptyArray;

        /**
         * Encodes the specified FetchUserInfoResponseProperty message. Does not implicitly {@link Oidb.FetchUserInfoResponseProperty.verify|verify} messages.
         * @function encode
         * @memberof Oidb.FetchUserInfoResponseProperty
         * @static
         * @param {Oidb.IFetchUserInfoResponseProperty} message FetchUserInfoResponseProperty message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FetchUserInfoResponseProperty.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.numberProperties != null && message.numberProperties.length)
                for (let i = 0; i < message.numberProperties.length; ++i)
                    $root.Oidb.OidbUserNumberProperty.encode(message.numberProperties[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
            if (message.bytesProperties != null && message.bytesProperties.length)
                for (let i = 0; i < message.bytesProperties.length; ++i)
                    $root.Oidb.OidbUserByteProperty.encode(message.bytesProperties[i], writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a FetchUserInfoResponseProperty message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.FetchUserInfoResponseProperty
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.FetchUserInfoResponseProperty} FetchUserInfoResponseProperty
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FetchUserInfoResponseProperty.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.FetchUserInfoResponseProperty();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        if (!(message.numberProperties && message.numberProperties.length))
                            message.numberProperties = [];
                        message.numberProperties.push($root.Oidb.OidbUserNumberProperty.decode(reader, reader.uint32()));
                        break;
                    }
                case 2: {
                        if (!(message.bytesProperties && message.bytesProperties.length))
                            message.bytesProperties = [];
                        message.bytesProperties.push($root.Oidb.OidbUserByteProperty.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for FetchUserInfoResponseProperty
         * @function getTypeUrl
         * @memberof Oidb.FetchUserInfoResponseProperty
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        FetchUserInfoResponseProperty.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.FetchUserInfoResponseProperty";
        };

        return FetchUserInfoResponseProperty;
    })();

    Oidb.OidbUserNumberProperty = (function() {

        /**
         * Properties of an OidbUserNumberProperty.
         * @memberof Oidb
         * @interface IOidbUserNumberProperty
         * @property {number|null} [key] OidbUserNumberProperty key
         * @property {number|null} [value] OidbUserNumberProperty value
         */

        /**
         * Constructs a new OidbUserNumberProperty.
         * @memberof Oidb
         * @classdesc Represents an OidbUserNumberProperty.
         * @implements IOidbUserNumberProperty
         * @constructor
         * @param {Oidb.IOidbUserNumberProperty=} [properties] Properties to set
         */
        function OidbUserNumberProperty(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * OidbUserNumberProperty key.
         * @member {number} key
         * @memberof Oidb.OidbUserNumberProperty
         * @instance
         */
        OidbUserNumberProperty.prototype.key = 0;

        /**
         * OidbUserNumberProperty value.
         * @member {number} value
         * @memberof Oidb.OidbUserNumberProperty
         * @instance
         */
        OidbUserNumberProperty.prototype.value = 0;

        /**
         * Encodes the specified OidbUserNumberProperty message. Does not implicitly {@link Oidb.OidbUserNumberProperty.verify|verify} messages.
         * @function encode
         * @memberof Oidb.OidbUserNumberProperty
         * @static
         * @param {Oidb.IOidbUserNumberProperty} message OidbUserNumberProperty message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        OidbUserNumberProperty.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.key != null && Object.hasOwnProperty.call(message, "key"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.key);
            if (message.value != null && Object.hasOwnProperty.call(message, "value"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.value);
            return writer;
        };

        /**
         * Decodes an OidbUserNumberProperty message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.OidbUserNumberProperty
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.OidbUserNumberProperty} OidbUserNumberProperty
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        OidbUserNumberProperty.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.OidbUserNumberProperty();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.key = reader.uint32();
                        break;
                    }
                case 2: {
                        message.value = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for OidbUserNumberProperty
         * @function getTypeUrl
         * @memberof Oidb.OidbUserNumberProperty
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        OidbUserNumberProperty.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.OidbUserNumberProperty";
        };

        return OidbUserNumberProperty;
    })();

    Oidb.OidbUserByteProperty = (function() {

        /**
         * Properties of an OidbUserByteProperty.
         * @memberof Oidb
         * @interface IOidbUserByteProperty
         * @property {number|null} [key] OidbUserByteProperty key
         * @property {Uint8Array|null} [value] OidbUserByteProperty value
         */

        /**
         * Constructs a new OidbUserByteProperty.
         * @memberof Oidb
         * @classdesc Represents an OidbUserByteProperty.
         * @implements IOidbUserByteProperty
         * @constructor
         * @param {Oidb.IOidbUserByteProperty=} [properties] Properties to set
         */
        function OidbUserByteProperty(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * OidbUserByteProperty key.
         * @member {number} key
         * @memberof Oidb.OidbUserByteProperty
         * @instance
         */
        OidbUserByteProperty.prototype.key = 0;

        /**
         * OidbUserByteProperty value.
         * @member {Uint8Array} value
         * @memberof Oidb.OidbUserByteProperty
         * @instance
         */
        OidbUserByteProperty.prototype.value = $util.newBuffer([]);

        /**
         * Encodes the specified OidbUserByteProperty message. Does not implicitly {@link Oidb.OidbUserByteProperty.verify|verify} messages.
         * @function encode
         * @memberof Oidb.OidbUserByteProperty
         * @static
         * @param {Oidb.IOidbUserByteProperty} message OidbUserByteProperty message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        OidbUserByteProperty.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.key != null && Object.hasOwnProperty.call(message, "key"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.key);
            if (message.value != null && Object.hasOwnProperty.call(message, "value"))
                writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.value);
            return writer;
        };

        /**
         * Decodes an OidbUserByteProperty message from the specified reader or buffer.
         * @function decode
         * @memberof Oidb.OidbUserByteProperty
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Oidb.OidbUserByteProperty} OidbUserByteProperty
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        OidbUserByteProperty.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Oidb.OidbUserByteProperty();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.key = reader.uint32();
                        break;
                    }
                case 2: {
                        message.value = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for OidbUserByteProperty
         * @function getTypeUrl
         * @memberof Oidb.OidbUserByteProperty
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        OidbUserByteProperty.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Oidb.OidbUserByteProperty";
        };

        return OidbUserByteProperty;
    })();

    return Oidb;
})();

export const Action = $root.Action = (() => {

    /**
     * Namespace Action.
     * @exports Action
     * @namespace
     */
    const Action = {};

    Action.SendLongMsgReq = (function() {

        /**
         * Properties of a SendLongMsgReq.
         * @memberof Action
         * @interface ISendLongMsgReq
         * @property {Action.ISendLongMsgInfo|null} [info] SendLongMsgReq info
         * @property {Action.ILongMsgSettings|null} [settings] SendLongMsgReq settings
         */

        /**
         * Constructs a new SendLongMsgReq.
         * @memberof Action
         * @classdesc Represents a SendLongMsgReq.
         * @implements ISendLongMsgReq
         * @constructor
         * @param {Action.ISendLongMsgReq=} [properties] Properties to set
         */
        function SendLongMsgReq(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SendLongMsgReq info.
         * @member {Action.ISendLongMsgInfo|null|undefined} info
         * @memberof Action.SendLongMsgReq
         * @instance
         */
        SendLongMsgReq.prototype.info = null;

        /**
         * SendLongMsgReq settings.
         * @member {Action.ILongMsgSettings|null|undefined} settings
         * @memberof Action.SendLongMsgReq
         * @instance
         */
        SendLongMsgReq.prototype.settings = null;

        /**
         * Encodes the specified SendLongMsgReq message. Does not implicitly {@link Action.SendLongMsgReq.verify|verify} messages.
         * @function encode
         * @memberof Action.SendLongMsgReq
         * @static
         * @param {Action.ISendLongMsgReq} message SendLongMsgReq message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SendLongMsgReq.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.info != null && Object.hasOwnProperty.call(message, "info"))
                $root.Action.SendLongMsgInfo.encode(message.info, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.settings != null && Object.hasOwnProperty.call(message, "settings"))
                $root.Action.LongMsgSettings.encode(message.settings, writer.uint32(/* id 15, wireType 2 =*/122).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a SendLongMsgReq message from the specified reader or buffer.
         * @function decode
         * @memberof Action.SendLongMsgReq
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Action.SendLongMsgReq} SendLongMsgReq
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SendLongMsgReq.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Action.SendLongMsgReq();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 2: {
                        message.info = $root.Action.SendLongMsgInfo.decode(reader, reader.uint32());
                        break;
                    }
                case 15: {
                        message.settings = $root.Action.LongMsgSettings.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for SendLongMsgReq
         * @function getTypeUrl
         * @memberof Action.SendLongMsgReq
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        SendLongMsgReq.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Action.SendLongMsgReq";
        };

        return SendLongMsgReq;
    })();

    Action.SendLongMsgInfo = (function() {

        /**
         * Properties of a SendLongMsgInfo.
         * @memberof Action
         * @interface ISendLongMsgInfo
         * @property {number|null} [type] SendLongMsgInfo type
         * @property {Action.ILongMsgPeer|null} [peer] SendLongMsgInfo peer
         * @property {number|null} [groupCode] SendLongMsgInfo groupCode
         * @property {Uint8Array|null} [payload] SendLongMsgInfo payload
         */

        /**
         * Constructs a new SendLongMsgInfo.
         * @memberof Action
         * @classdesc Represents a SendLongMsgInfo.
         * @implements ISendLongMsgInfo
         * @constructor
         * @param {Action.ISendLongMsgInfo=} [properties] Properties to set
         */
        function SendLongMsgInfo(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SendLongMsgInfo type.
         * @member {number} type
         * @memberof Action.SendLongMsgInfo
         * @instance
         */
        SendLongMsgInfo.prototype.type = 0;

        /**
         * SendLongMsgInfo peer.
         * @member {Action.ILongMsgPeer|null|undefined} peer
         * @memberof Action.SendLongMsgInfo
         * @instance
         */
        SendLongMsgInfo.prototype.peer = null;

        /**
         * SendLongMsgInfo groupCode.
         * @member {number} groupCode
         * @memberof Action.SendLongMsgInfo
         * @instance
         */
        SendLongMsgInfo.prototype.groupCode = 0;

        /**
         * SendLongMsgInfo payload.
         * @member {Uint8Array} payload
         * @memberof Action.SendLongMsgInfo
         * @instance
         */
        SendLongMsgInfo.prototype.payload = $util.newBuffer([]);

        /**
         * Encodes the specified SendLongMsgInfo message. Does not implicitly {@link Action.SendLongMsgInfo.verify|verify} messages.
         * @function encode
         * @memberof Action.SendLongMsgInfo
         * @static
         * @param {Action.ISendLongMsgInfo} message SendLongMsgInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SendLongMsgInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.type != null && Object.hasOwnProperty.call(message, "type"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.type);
            if (message.peer != null && Object.hasOwnProperty.call(message, "peer"))
                $root.Action.LongMsgPeer.encode(message.peer, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.groupCode != null && Object.hasOwnProperty.call(message, "groupCode"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.groupCode);
            if (message.payload != null && Object.hasOwnProperty.call(message, "payload"))
                writer.uint32(/* id 4, wireType 2 =*/34).bytes(message.payload);
            return writer;
        };

        /**
         * Decodes a SendLongMsgInfo message from the specified reader or buffer.
         * @function decode
         * @memberof Action.SendLongMsgInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Action.SendLongMsgInfo} SendLongMsgInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SendLongMsgInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Action.SendLongMsgInfo();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.type = reader.uint32();
                        break;
                    }
                case 2: {
                        message.peer = $root.Action.LongMsgPeer.decode(reader, reader.uint32());
                        break;
                    }
                case 3: {
                        message.groupCode = reader.uint32();
                        break;
                    }
                case 4: {
                        message.payload = reader.bytes();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for SendLongMsgInfo
         * @function getTypeUrl
         * @memberof Action.SendLongMsgInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        SendLongMsgInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Action.SendLongMsgInfo";
        };

        return SendLongMsgInfo;
    })();

    Action.LongMsgPeer = (function() {

        /**
         * Properties of a LongMsgPeer.
         * @memberof Action
         * @interface ILongMsgPeer
         * @property {string|null} [uid] LongMsgPeer uid
         */

        /**
         * Constructs a new LongMsgPeer.
         * @memberof Action
         * @classdesc Represents a LongMsgPeer.
         * @implements ILongMsgPeer
         * @constructor
         * @param {Action.ILongMsgPeer=} [properties] Properties to set
         */
        function LongMsgPeer(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * LongMsgPeer uid.
         * @member {string} uid
         * @memberof Action.LongMsgPeer
         * @instance
         */
        LongMsgPeer.prototype.uid = "";

        /**
         * Encodes the specified LongMsgPeer message. Does not implicitly {@link Action.LongMsgPeer.verify|verify} messages.
         * @function encode
         * @memberof Action.LongMsgPeer
         * @static
         * @param {Action.ILongMsgPeer} message LongMsgPeer message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LongMsgPeer.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.uid != null && Object.hasOwnProperty.call(message, "uid"))
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.uid);
            return writer;
        };

        /**
         * Decodes a LongMsgPeer message from the specified reader or buffer.
         * @function decode
         * @memberof Action.LongMsgPeer
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Action.LongMsgPeer} LongMsgPeer
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LongMsgPeer.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Action.LongMsgPeer();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 2: {
                        message.uid = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for LongMsgPeer
         * @function getTypeUrl
         * @memberof Action.LongMsgPeer
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        LongMsgPeer.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Action.LongMsgPeer";
        };

        return LongMsgPeer;
    })();

    Action.LongMsgSettings = (function() {

        /**
         * Properties of a LongMsgSettings.
         * @memberof Action
         * @interface ILongMsgSettings
         * @property {number|null} [field1] LongMsgSettings field1
         * @property {number|null} [field2] LongMsgSettings field2
         * @property {number|null} [field3] LongMsgSettings field3
         * @property {number|null} [field4] LongMsgSettings field4
         */

        /**
         * Constructs a new LongMsgSettings.
         * @memberof Action
         * @classdesc Represents a LongMsgSettings.
         * @implements ILongMsgSettings
         * @constructor
         * @param {Action.ILongMsgSettings=} [properties] Properties to set
         */
        function LongMsgSettings(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * LongMsgSettings field1.
         * @member {number} field1
         * @memberof Action.LongMsgSettings
         * @instance
         */
        LongMsgSettings.prototype.field1 = 0;

        /**
         * LongMsgSettings field2.
         * @member {number} field2
         * @memberof Action.LongMsgSettings
         * @instance
         */
        LongMsgSettings.prototype.field2 = 0;

        /**
         * LongMsgSettings field3.
         * @member {number} field3
         * @memberof Action.LongMsgSettings
         * @instance
         */
        LongMsgSettings.prototype.field3 = 0;

        /**
         * LongMsgSettings field4.
         * @member {number} field4
         * @memberof Action.LongMsgSettings
         * @instance
         */
        LongMsgSettings.prototype.field4 = 0;

        /**
         * Encodes the specified LongMsgSettings message. Does not implicitly {@link Action.LongMsgSettings.verify|verify} messages.
         * @function encode
         * @memberof Action.LongMsgSettings
         * @static
         * @param {Action.ILongMsgSettings} message LongMsgSettings message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        LongMsgSettings.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.field1 != null && Object.hasOwnProperty.call(message, "field1"))
                writer.uint32(/* id 1, wireType 0 =*/8).uint32(message.field1);
            if (message.field2 != null && Object.hasOwnProperty.call(message, "field2"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.field2);
            if (message.field3 != null && Object.hasOwnProperty.call(message, "field3"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.field3);
            if (message.field4 != null && Object.hasOwnProperty.call(message, "field4"))
                writer.uint32(/* id 4, wireType 0 =*/32).uint32(message.field4);
            return writer;
        };

        /**
         * Decodes a LongMsgSettings message from the specified reader or buffer.
         * @function decode
         * @memberof Action.LongMsgSettings
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Action.LongMsgSettings} LongMsgSettings
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        LongMsgSettings.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Action.LongMsgSettings();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 1: {
                        message.field1 = reader.uint32();
                        break;
                    }
                case 2: {
                        message.field2 = reader.uint32();
                        break;
                    }
                case 3: {
                        message.field3 = reader.uint32();
                        break;
                    }
                case 4: {
                        message.field4 = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for LongMsgSettings
         * @function getTypeUrl
         * @memberof Action.LongMsgSettings
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        LongMsgSettings.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Action.LongMsgSettings";
        };

        return LongMsgSettings;
    })();

    Action.SendLongMsgResp = (function() {

        /**
         * Properties of a SendLongMsgResp.
         * @memberof Action
         * @interface ISendLongMsgResp
         * @property {Action.ISendLongMsgResult|null} [result] SendLongMsgResp result
         * @property {Action.ILongMsgSettings|null} [settings] SendLongMsgResp settings
         */

        /**
         * Constructs a new SendLongMsgResp.
         * @memberof Action
         * @classdesc Represents a SendLongMsgResp.
         * @implements ISendLongMsgResp
         * @constructor
         * @param {Action.ISendLongMsgResp=} [properties] Properties to set
         */
        function SendLongMsgResp(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SendLongMsgResp result.
         * @member {Action.ISendLongMsgResult|null|undefined} result
         * @memberof Action.SendLongMsgResp
         * @instance
         */
        SendLongMsgResp.prototype.result = null;

        /**
         * SendLongMsgResp settings.
         * @member {Action.ILongMsgSettings|null|undefined} settings
         * @memberof Action.SendLongMsgResp
         * @instance
         */
        SendLongMsgResp.prototype.settings = null;

        /**
         * Encodes the specified SendLongMsgResp message. Does not implicitly {@link Action.SendLongMsgResp.verify|verify} messages.
         * @function encode
         * @memberof Action.SendLongMsgResp
         * @static
         * @param {Action.ISendLongMsgResp} message SendLongMsgResp message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SendLongMsgResp.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.result != null && Object.hasOwnProperty.call(message, "result"))
                $root.Action.SendLongMsgResult.encode(message.result, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
            if (message.settings != null && Object.hasOwnProperty.call(message, "settings"))
                $root.Action.LongMsgSettings.encode(message.settings, writer.uint32(/* id 15, wireType 2 =*/122).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a SendLongMsgResp message from the specified reader or buffer.
         * @function decode
         * @memberof Action.SendLongMsgResp
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Action.SendLongMsgResp} SendLongMsgResp
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SendLongMsgResp.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Action.SendLongMsgResp();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 2: {
                        message.result = $root.Action.SendLongMsgResult.decode(reader, reader.uint32());
                        break;
                    }
                case 15: {
                        message.settings = $root.Action.LongMsgSettings.decode(reader, reader.uint32());
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for SendLongMsgResp
         * @function getTypeUrl
         * @memberof Action.SendLongMsgResp
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        SendLongMsgResp.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Action.SendLongMsgResp";
        };

        return SendLongMsgResp;
    })();

    Action.SendLongMsgResult = (function() {

        /**
         * Properties of a SendLongMsgResult.
         * @memberof Action
         * @interface ISendLongMsgResult
         * @property {string|null} [resId] SendLongMsgResult resId
         */

        /**
         * Constructs a new SendLongMsgResult.
         * @memberof Action
         * @classdesc Represents a SendLongMsgResult.
         * @implements ISendLongMsgResult
         * @constructor
         * @param {Action.ISendLongMsgResult=} [properties] Properties to set
         */
        function SendLongMsgResult(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SendLongMsgResult resId.
         * @member {string} resId
         * @memberof Action.SendLongMsgResult
         * @instance
         */
        SendLongMsgResult.prototype.resId = "";

        /**
         * Encodes the specified SendLongMsgResult message. Does not implicitly {@link Action.SendLongMsgResult.verify|verify} messages.
         * @function encode
         * @memberof Action.SendLongMsgResult
         * @static
         * @param {Action.ISendLongMsgResult} message SendLongMsgResult message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SendLongMsgResult.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.resId != null && Object.hasOwnProperty.call(message, "resId"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.resId);
            return writer;
        };

        /**
         * Decodes a SendLongMsgResult message from the specified reader or buffer.
         * @function decode
         * @memberof Action.SendLongMsgResult
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Action.SendLongMsgResult} SendLongMsgResult
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SendLongMsgResult.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Action.SendLongMsgResult();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 3: {
                        message.resId = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for SendLongMsgResult
         * @function getTypeUrl
         * @memberof Action.SendLongMsgResult
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        SendLongMsgResult.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Action.SendLongMsgResult";
        };

        return SendLongMsgResult;
    })();

    Action.PullPicsReq = (function() {

        /**
         * Properties of a PullPicsReq.
         * @memberof Action
         * @interface IPullPicsReq
         * @property {number|null} [uin] PullPicsReq uin
         * @property {number|null} [field3] PullPicsReq field3
         * @property {string|null} [word] PullPicsReq word
         * @property {string|null} [word2] PullPicsReq word2
         * @property {number|null} [field8] PullPicsReq field8
         * @property {number|null} [field9] PullPicsReq field9
         * @property {number|null} [field14] PullPicsReq field14
         */

        /**
         * Constructs a new PullPicsReq.
         * @memberof Action
         * @classdesc Represents a PullPicsReq.
         * @implements IPullPicsReq
         * @constructor
         * @param {Action.IPullPicsReq=} [properties] Properties to set
         */
        function PullPicsReq(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PullPicsReq uin.
         * @member {number} uin
         * @memberof Action.PullPicsReq
         * @instance
         */
        PullPicsReq.prototype.uin = 0;

        /**
         * PullPicsReq field3.
         * @member {number} field3
         * @memberof Action.PullPicsReq
         * @instance
         */
        PullPicsReq.prototype.field3 = 0;

        /**
         * PullPicsReq word.
         * @member {string} word
         * @memberof Action.PullPicsReq
         * @instance
         */
        PullPicsReq.prototype.word = "";

        /**
         * PullPicsReq word2.
         * @member {string} word2
         * @memberof Action.PullPicsReq
         * @instance
         */
        PullPicsReq.prototype.word2 = "";

        /**
         * PullPicsReq field8.
         * @member {number} field8
         * @memberof Action.PullPicsReq
         * @instance
         */
        PullPicsReq.prototype.field8 = 0;

        /**
         * PullPicsReq field9.
         * @member {number} field9
         * @memberof Action.PullPicsReq
         * @instance
         */
        PullPicsReq.prototype.field9 = 0;

        /**
         * PullPicsReq field14.
         * @member {number} field14
         * @memberof Action.PullPicsReq
         * @instance
         */
        PullPicsReq.prototype.field14 = 0;

        /**
         * Encodes the specified PullPicsReq message. Does not implicitly {@link Action.PullPicsReq.verify|verify} messages.
         * @function encode
         * @memberof Action.PullPicsReq
         * @static
         * @param {Action.IPullPicsReq} message PullPicsReq message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PullPicsReq.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.uin != null && Object.hasOwnProperty.call(message, "uin"))
                writer.uint32(/* id 2, wireType 0 =*/16).uint32(message.uin);
            if (message.field3 != null && Object.hasOwnProperty.call(message, "field3"))
                writer.uint32(/* id 3, wireType 0 =*/24).uint32(message.field3);
            if (message.word != null && Object.hasOwnProperty.call(message, "word"))
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.word);
            if (message.word2 != null && Object.hasOwnProperty.call(message, "word2"))
                writer.uint32(/* id 7, wireType 2 =*/58).string(message.word2);
            if (message.field8 != null && Object.hasOwnProperty.call(message, "field8"))
                writer.uint32(/* id 8, wireType 0 =*/64).uint32(message.field8);
            if (message.field9 != null && Object.hasOwnProperty.call(message, "field9"))
                writer.uint32(/* id 9, wireType 0 =*/72).uint32(message.field9);
            if (message.field14 != null && Object.hasOwnProperty.call(message, "field14"))
                writer.uint32(/* id 14, wireType 0 =*/112).uint32(message.field14);
            return writer;
        };

        /**
         * Decodes a PullPicsReq message from the specified reader or buffer.
         * @function decode
         * @memberof Action.PullPicsReq
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Action.PullPicsReq} PullPicsReq
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PullPicsReq.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Action.PullPicsReq();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 2: {
                        message.uin = reader.uint32();
                        break;
                    }
                case 3: {
                        message.field3 = reader.uint32();
                        break;
                    }
                case 6: {
                        message.word = reader.string();
                        break;
                    }
                case 7: {
                        message.word2 = reader.string();
                        break;
                    }
                case 8: {
                        message.field8 = reader.uint32();
                        break;
                    }
                case 9: {
                        message.field9 = reader.uint32();
                        break;
                    }
                case 14: {
                        message.field14 = reader.uint32();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for PullPicsReq
         * @function getTypeUrl
         * @memberof Action.PullPicsReq
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PullPicsReq.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Action.PullPicsReq";
        };

        return PullPicsReq;
    })();

    Action.PullPicsImgInfo = (function() {

        /**
         * Properties of a PullPicsImgInfo.
         * @memberof Action
         * @interface IPullPicsImgInfo
         * @property {string|null} [url] PullPicsImgInfo url
         */

        /**
         * Constructs a new PullPicsImgInfo.
         * @memberof Action
         * @classdesc Represents a PullPicsImgInfo.
         * @implements IPullPicsImgInfo
         * @constructor
         * @param {Action.IPullPicsImgInfo=} [properties] Properties to set
         */
        function PullPicsImgInfo(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PullPicsImgInfo url.
         * @member {string} url
         * @memberof Action.PullPicsImgInfo
         * @instance
         */
        PullPicsImgInfo.prototype.url = "";

        /**
         * Encodes the specified PullPicsImgInfo message. Does not implicitly {@link Action.PullPicsImgInfo.verify|verify} messages.
         * @function encode
         * @memberof Action.PullPicsImgInfo
         * @static
         * @param {Action.IPullPicsImgInfo} message PullPicsImgInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PullPicsImgInfo.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.url != null && Object.hasOwnProperty.call(message, "url"))
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.url);
            return writer;
        };

        /**
         * Decodes a PullPicsImgInfo message from the specified reader or buffer.
         * @function decode
         * @memberof Action.PullPicsImgInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Action.PullPicsImgInfo} PullPicsImgInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PullPicsImgInfo.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Action.PullPicsImgInfo();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 5: {
                        message.url = reader.string();
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for PullPicsImgInfo
         * @function getTypeUrl
         * @memberof Action.PullPicsImgInfo
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PullPicsImgInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Action.PullPicsImgInfo";
        };

        return PullPicsImgInfo;
    })();

    Action.PullPicsResp = (function() {

        /**
         * Properties of a PullPicsResp.
         * @memberof Action
         * @interface IPullPicsResp
         * @property {Array.<Action.IPullPicsImgInfo>|null} [info] PullPicsResp info
         */

        /**
         * Constructs a new PullPicsResp.
         * @memberof Action
         * @classdesc Represents a PullPicsResp.
         * @implements IPullPicsResp
         * @constructor
         * @param {Action.IPullPicsResp=} [properties] Properties to set
         */
        function PullPicsResp(properties) {
            this.info = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * PullPicsResp info.
         * @member {Array.<Action.IPullPicsImgInfo>} info
         * @memberof Action.PullPicsResp
         * @instance
         */
        PullPicsResp.prototype.info = $util.emptyArray;

        /**
         * Encodes the specified PullPicsResp message. Does not implicitly {@link Action.PullPicsResp.verify|verify} messages.
         * @function encode
         * @memberof Action.PullPicsResp
         * @static
         * @param {Action.IPullPicsResp} message PullPicsResp message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        PullPicsResp.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            if (message.info != null && message.info.length)
                for (let i = 0; i < message.info.length; ++i)
                    $root.Action.PullPicsImgInfo.encode(message.info[i], writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
            return writer;
        };

        /**
         * Decodes a PullPicsResp message from the specified reader or buffer.
         * @function decode
         * @memberof Action.PullPicsResp
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {Action.PullPicsResp} PullPicsResp
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        PullPicsResp.decode = function decode(reader, length, error) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length, message = new $root.Action.PullPicsResp();
            while (reader.pos < end) {
                let tag = reader.uint32();
                if (tag === error)
                    break;
                switch (tag >>> 3) {
                case 3: {
                        if (!(message.info && message.info.length))
                            message.info = [];
                        message.info.push($root.Action.PullPicsImgInfo.decode(reader, reader.uint32()));
                        break;
                    }
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            return message;
        };

        /**
         * Gets the default type url for PullPicsResp
         * @function getTypeUrl
         * @memberof Action.PullPicsResp
         * @static
         * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns {string} The default type url
         */
        PullPicsResp.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
            if (typeUrlPrefix === undefined) {
                typeUrlPrefix = "type.googleapis.com";
            }
            return typeUrlPrefix + "/Action.PullPicsResp";
        };

        return PullPicsResp;
    })();

    return Action;
})();

export { $root as default };
