import * as $protobuf from "protobufjs";
import Long = require("long");
/** Namespace SysMsg. */
export namespace SysMsg {

    /** Properties of a SystemMessage. */
    interface ISystemMessage {

        /** SystemMessage header */
        header?: (SysMsg.ISystemMessageHeader[]|null);

        /** SystemMessage msgSpec */
        msgSpec?: (SysMsg.ISystemMessageMsgSpec[]|null);

        /** SystemMessage bodyWrapper */
        bodyWrapper?: (SysMsg.ISystemMessageBodyWrapper|null);
    }

    /** Represents a SystemMessage. */
    class SystemMessage implements ISystemMessage {

        /**
         * Constructs a new SystemMessage.
         * @param [properties] Properties to set
         */
        constructor(properties?: SysMsg.ISystemMessage);

        /** SystemMessage header. */
        public header: SysMsg.ISystemMessageHeader[];

        /** SystemMessage msgSpec. */
        public msgSpec: SysMsg.ISystemMessageMsgSpec[];

        /** SystemMessage bodyWrapper. */
        public bodyWrapper?: (SysMsg.ISystemMessageBodyWrapper|null);

        /**
         * Decodes a SystemMessage message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SystemMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SysMsg.SystemMessage;

        /**
         * Decodes a SystemMessage message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns SystemMessage
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): SysMsg.SystemMessage;

        /**
         * Gets the default type url for SystemMessage
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SystemMessageHeader. */
    interface ISystemMessageHeader {

        /** SystemMessageHeader peerUin */
        peerUin?: (number|null);

        /** SystemMessageHeader uin */
        uin?: (number|null);

        /** SystemMessageHeader uid */
        uid?: (string|null);
    }

    /** Represents a SystemMessageHeader. */
    class SystemMessageHeader implements ISystemMessageHeader {

        /**
         * Constructs a new SystemMessageHeader.
         * @param [properties] Properties to set
         */
        constructor(properties?: SysMsg.ISystemMessageHeader);

        /** SystemMessageHeader peerUin. */
        public peerUin: number;

        /** SystemMessageHeader uin. */
        public uin: number;

        /** SystemMessageHeader uid. */
        public uid?: (string|null);

        /**
         * Decodes a SystemMessageHeader message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SystemMessageHeader
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SysMsg.SystemMessageHeader;

        /**
         * Decodes a SystemMessageHeader message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns SystemMessageHeader
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): SysMsg.SystemMessageHeader;

        /**
         * Gets the default type url for SystemMessageHeader
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SystemMessageMsgSpec. */
    interface ISystemMessageMsgSpec {

        /** SystemMessageMsgSpec msgType */
        msgType?: (number|null);

        /** SystemMessageMsgSpec subType */
        subType?: (number|null);

        /** SystemMessageMsgSpec subSubType */
        subSubType?: (number|null);

        /** SystemMessageMsgSpec msgSeq */
        msgSeq?: (number|null);

        /** SystemMessageMsgSpec time */
        time?: (number|null);

        /** SystemMessageMsgSpec other */
        other?: (number|null);
    }

    /** Represents a SystemMessageMsgSpec. */
    class SystemMessageMsgSpec implements ISystemMessageMsgSpec {

        /**
         * Constructs a new SystemMessageMsgSpec.
         * @param [properties] Properties to set
         */
        constructor(properties?: SysMsg.ISystemMessageMsgSpec);

        /** SystemMessageMsgSpec msgType. */
        public msgType: number;

        /** SystemMessageMsgSpec subType. */
        public subType?: (number|null);

        /** SystemMessageMsgSpec subSubType. */
        public subSubType?: (number|null);

        /** SystemMessageMsgSpec msgSeq. */
        public msgSeq: number;

        /** SystemMessageMsgSpec time. */
        public time: number;

        /** SystemMessageMsgSpec other. */
        public other?: (number|null);

        /**
         * Decodes a SystemMessageMsgSpec message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SystemMessageMsgSpec
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SysMsg.SystemMessageMsgSpec;

        /**
         * Decodes a SystemMessageMsgSpec message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns SystemMessageMsgSpec
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): SysMsg.SystemMessageMsgSpec;

        /**
         * Gets the default type url for SystemMessageMsgSpec
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SystemMessageBodyWrapper. */
    interface ISystemMessageBodyWrapper {

        /** SystemMessageBodyWrapper body */
        body?: (Uint8Array|null);
    }

    /** Represents a SystemMessageBodyWrapper. */
    class SystemMessageBodyWrapper implements ISystemMessageBodyWrapper {

        /**
         * Constructs a new SystemMessageBodyWrapper.
         * @param [properties] Properties to set
         */
        constructor(properties?: SysMsg.ISystemMessageBodyWrapper);

        /** SystemMessageBodyWrapper body. */
        public body: Uint8Array;

        /**
         * Decodes a SystemMessageBodyWrapper message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SystemMessageBodyWrapper
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SysMsg.SystemMessageBodyWrapper;

        /**
         * Decodes a SystemMessageBodyWrapper message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns SystemMessageBodyWrapper
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): SysMsg.SystemMessageBodyWrapper;

        /**
         * Gets the default type url for SystemMessageBodyWrapper
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a LikeDetail. */
    interface ILikeDetail {

        /** LikeDetail txt */
        txt?: (string|null);

        /** LikeDetail uin */
        uin?: (number|null);

        /** LikeDetail nickname */
        nickname?: (string|null);
    }

    /** Represents a LikeDetail. */
    class LikeDetail implements ILikeDetail {

        /**
         * Constructs a new LikeDetail.
         * @param [properties] Properties to set
         */
        constructor(properties?: SysMsg.ILikeDetail);

        /** LikeDetail txt. */
        public txt: string;

        /** LikeDetail uin. */
        public uin: number;

        /** LikeDetail nickname. */
        public nickname: string;

        /**
         * Decodes a LikeDetail message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns LikeDetail
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SysMsg.LikeDetail;

        /**
         * Decodes a LikeDetail message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns LikeDetail
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): SysMsg.LikeDetail;

        /**
         * Gets the default type url for LikeDetail
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a LikeMsg. */
    interface ILikeMsg {

        /** LikeMsg count */
        count?: (number|null);

        /** LikeMsg time */
        time?: (number|null);

        /** LikeMsg detail */
        detail?: (SysMsg.ILikeDetail|null);
    }

    /** Represents a LikeMsg. */
    class LikeMsg implements ILikeMsg {

        /**
         * Constructs a new LikeMsg.
         * @param [properties] Properties to set
         */
        constructor(properties?: SysMsg.ILikeMsg);

        /** LikeMsg count. */
        public count: number;

        /** LikeMsg time. */
        public time: number;

        /** LikeMsg detail. */
        public detail?: (SysMsg.ILikeDetail|null);

        /**
         * Decodes a LikeMsg message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns LikeMsg
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SysMsg.LikeMsg;

        /**
         * Decodes a LikeMsg message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns LikeMsg
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): SysMsg.LikeMsg;

        /**
         * Gets the default type url for LikeMsg
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a ProfileLikeSubTip. */
    interface IProfileLikeSubTip {

        /** ProfileLikeSubTip msg */
        msg?: (SysMsg.ILikeMsg|null);
    }

    /** Represents a ProfileLikeSubTip. */
    class ProfileLikeSubTip implements IProfileLikeSubTip {

        /**
         * Constructs a new ProfileLikeSubTip.
         * @param [properties] Properties to set
         */
        constructor(properties?: SysMsg.IProfileLikeSubTip);

        /** ProfileLikeSubTip msg. */
        public msg?: (SysMsg.ILikeMsg|null);

        /**
         * Decodes a ProfileLikeSubTip message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns ProfileLikeSubTip
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SysMsg.ProfileLikeSubTip;

        /**
         * Decodes a ProfileLikeSubTip message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns ProfileLikeSubTip
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): SysMsg.ProfileLikeSubTip;

        /**
         * Gets the default type url for ProfileLikeSubTip
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a ProfileLikeTip. */
    interface IProfileLikeTip {

        /** ProfileLikeTip msgType */
        msgType?: (number|null);

        /** ProfileLikeTip subType */
        subType?: (number|null);

        /** ProfileLikeTip content */
        content?: (SysMsg.IProfileLikeSubTip|null);
    }

    /** Represents a ProfileLikeTip. */
    class ProfileLikeTip implements IProfileLikeTip {

        /**
         * Constructs a new ProfileLikeTip.
         * @param [properties] Properties to set
         */
        constructor(properties?: SysMsg.IProfileLikeTip);

        /** ProfileLikeTip msgType. */
        public msgType: number;

        /** ProfileLikeTip subType. */
        public subType: number;

        /** ProfileLikeTip content. */
        public content?: (SysMsg.IProfileLikeSubTip|null);

        /**
         * Decodes a ProfileLikeTip message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns ProfileLikeTip
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SysMsg.ProfileLikeTip;

        /**
         * Decodes a ProfileLikeTip message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns ProfileLikeTip
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): SysMsg.ProfileLikeTip;

        /**
         * Gets the default type url for ProfileLikeTip
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a GroupMemberIncrease. */
    interface IGroupMemberIncrease {

        /** GroupMemberIncrease groupCode */
        groupCode?: (number|null);

        /** GroupMemberIncrease memberUid */
        memberUid?: (string|null);

        /** GroupMemberIncrease type */
        type?: (number|null);

        /** GroupMemberIncrease adminUid */
        adminUid?: (string|null);
    }

    /** Represents a GroupMemberIncrease. */
    class GroupMemberIncrease implements IGroupMemberIncrease {

        /**
         * Constructs a new GroupMemberIncrease.
         * @param [properties] Properties to set
         */
        constructor(properties?: SysMsg.IGroupMemberIncrease);

        /** GroupMemberIncrease groupCode. */
        public groupCode: number;

        /** GroupMemberIncrease memberUid. */
        public memberUid: string;

        /** GroupMemberIncrease type. */
        public type: number;

        /** GroupMemberIncrease adminUid. */
        public adminUid: string;

        /**
         * Decodes a GroupMemberIncrease message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns GroupMemberIncrease
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SysMsg.GroupMemberIncrease;

        /**
         * Decodes a GroupMemberIncrease message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns GroupMemberIncrease
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): SysMsg.GroupMemberIncrease;

        /**
         * Gets the default type url for GroupMemberIncrease
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}
