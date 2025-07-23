// DO NOT EDIT! This is a generated file. Edit the JSDoc in src/*.js instead and run 'npm run build:types'.

/** Namespace SysMsg. */
export namespace SysMsg {

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
         * Encodes the specified LikeDetail message. Does not implicitly {@link SysMsg.LikeDetail.verify|verify} messages.
         * @param message LikeDetail message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: SysMsg.ILikeDetail, writer?: $protobuf.Writer): $protobuf.Writer;

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
         * Encodes the specified LikeMsg message. Does not implicitly {@link SysMsg.LikeMsg.verify|verify} messages.
         * @param message LikeMsg message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: SysMsg.ILikeMsg, writer?: $protobuf.Writer): $protobuf.Writer;

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
         * Encodes the specified ProfileLikeSubTip message. Does not implicitly {@link SysMsg.ProfileLikeSubTip.verify|verify} messages.
         * @param message ProfileLikeSubTip message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: SysMsg.IProfileLikeSubTip, writer?: $protobuf.Writer): $protobuf.Writer;

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
         * Encodes the specified ProfileLikeTip message. Does not implicitly {@link SysMsg.ProfileLikeTip.verify|verify} messages.
         * @param message ProfileLikeTip message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: SysMsg.IProfileLikeTip, writer?: $protobuf.Writer): $protobuf.Writer;

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
         * Gets the default type url for ProfileLikeTip
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a GroupMemberChange. */
    interface IGroupMemberChange {

        /** GroupMemberChange groupCode */
        groupCode?: (number|null);

        /** GroupMemberChange memberUid */
        memberUid?: (string|null);

        /** GroupMemberChange type */
        type?: (number|null);

        /** GroupMemberChange adminUid */
        adminUid?: (string|null);
    }

    /** Represents a GroupMemberChange. */
    class GroupMemberChange implements IGroupMemberChange {

        /**
         * Constructs a new GroupMemberChange.
         * @param [properties] Properties to set
         */
        constructor(properties?: SysMsg.IGroupMemberChange);

        /** GroupMemberChange groupCode. */
        public groupCode: number;

        /** GroupMemberChange memberUid. */
        public memberUid: string;

        /** GroupMemberChange type. */
        public type: number;

        /** GroupMemberChange adminUid. */
        public adminUid: string;

        /**
         * Encodes the specified GroupMemberChange message. Does not implicitly {@link SysMsg.GroupMemberChange.verify|verify} messages.
         * @param message GroupMemberChange message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: SysMsg.IGroupMemberChange, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a GroupMemberChange message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns GroupMemberChange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SysMsg.GroupMemberChange;

        /**
         * Gets the default type url for GroupMemberChange
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a GroupInvite. */
    interface IGroupInvite {

        /** GroupInvite groupCode */
        groupCode?: (number|null);

        /** GroupInvite operatorUid */
        operatorUid?: (string|null);
    }

    /** Represents a GroupInvite. */
    class GroupInvite implements IGroupInvite {

        /**
         * Constructs a new GroupInvite.
         * @param [properties] Properties to set
         */
        constructor(properties?: SysMsg.IGroupInvite);

        /** GroupInvite groupCode. */
        public groupCode: number;

        /** GroupInvite operatorUid. */
        public operatorUid: string;

        /**
         * Encodes the specified GroupInvite message. Does not implicitly {@link SysMsg.GroupInvite.verify|verify} messages.
         * @param message GroupInvite message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: SysMsg.IGroupInvite, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a GroupInvite message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns GroupInvite
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): SysMsg.GroupInvite;

        /**
         * Gets the default type url for GroupInvite
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}

/** Namespace Msg. */
export namespace Msg {

    /** Properties of a RoutingHead. */
    interface IRoutingHead {

        /** RoutingHead fromUin */
        fromUin?: (number|Long|null);

        /** RoutingHead fromUid */
        fromUid?: (string|null);

        /** RoutingHead fromAppid */
        fromAppid?: (number|null);

        /** RoutingHead fromInstid */
        fromInstid?: (number|null);

        /** RoutingHead toUin */
        toUin?: (number|Long|null);

        /** RoutingHead toUid */
        toUid?: (string|null);

        /** RoutingHead c2c */
        c2c?: (Msg.IC2c|null);

        /** RoutingHead group */
        group?: (Msg.IGroup|null);
    }

    /** Represents a RoutingHead. */
    class RoutingHead implements IRoutingHead {

        /**
         * Constructs a new RoutingHead.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IRoutingHead);

        /** RoutingHead fromUin. */
        public fromUin?: (number|Long|null);

        /** RoutingHead fromUid. */
        public fromUid?: (string|null);

        /** RoutingHead fromAppid. */
        public fromAppid?: (number|null);

        /** RoutingHead fromInstid. */
        public fromInstid?: (number|null);

        /** RoutingHead toUin. */
        public toUin?: (number|Long|null);

        /** RoutingHead toUid. */
        public toUid?: (string|null);

        /** RoutingHead c2c. */
        public c2c?: (Msg.IC2c|null);

        /** RoutingHead group. */
        public group?: (Msg.IGroup|null);

        /**
         * Encodes the specified RoutingHead message. Does not implicitly {@link Msg.RoutingHead.verify|verify} messages.
         * @param message RoutingHead message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IRoutingHead, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a RoutingHead message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns RoutingHead
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.RoutingHead;

        /**
         * Gets the default type url for RoutingHead
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a C2c. */
    interface IC2c {

        /** C2c friendName */
        friendName?: (string|null);
    }

    /** Represents a C2c. */
    class C2c implements IC2c {

        /**
         * Constructs a new C2c.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IC2c);

        /** C2c friendName. */
        public friendName?: (string|null);

        /**
         * Encodes the specified C2c message. Does not implicitly {@link Msg.C2c.verify|verify} messages.
         * @param message C2c message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IC2c, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a C2c message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns C2c
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.C2c;

        /**
         * Gets the default type url for C2c
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a Group. */
    interface IGroup {

        /** Group groupCode */
        groupCode?: (number|Long|null);

        /** Group groupType */
        groupType?: (number|null);

        /** Group groupInfoSeq */
        groupInfoSeq?: (number|Long|null);

        /** Group groupCard */
        groupCard?: (string|null);

        /** Group groupCardType */
        groupCardType?: (number|null);

        /** Group groupLevel */
        groupLevel?: (number|null);

        /** Group groupName */
        groupName?: (string|null);

        /** Group extGroupKeyInfo */
        extGroupKeyInfo?: (string|null);

        /** Group msgFlag */
        msgFlag?: (number|null);
    }

    /** Represents a Group. */
    class Group implements IGroup {

        /**
         * Constructs a new Group.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IGroup);

        /** Group groupCode. */
        public groupCode?: (number|Long|null);

        /** Group groupType. */
        public groupType?: (number|null);

        /** Group groupInfoSeq. */
        public groupInfoSeq?: (number|Long|null);

        /** Group groupCard. */
        public groupCard?: (string|null);

        /** Group groupCardType. */
        public groupCardType?: (number|null);

        /** Group groupLevel. */
        public groupLevel?: (number|null);

        /** Group groupName. */
        public groupName?: (string|null);

        /** Group extGroupKeyInfo. */
        public extGroupKeyInfo?: (string|null);

        /** Group msgFlag. */
        public msgFlag?: (number|null);

        /**
         * Encodes the specified Group message. Does not implicitly {@link Msg.Group.verify|verify} messages.
         * @param message Group message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IGroup, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Group message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Group
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.Group;

        /**
         * Gets the default type url for Group
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a ContentHead. */
    interface IContentHead {

        /** ContentHead msgType */
        msgType?: (number|Long|null);

        /** ContentHead subType */
        subType?: (number|Long|null);

        /** ContentHead c2cCmd */
        c2cCmd?: (number|null);

        /** ContentHead random */
        random?: (number|Long|null);

        /** ContentHead msgSeq */
        msgSeq?: (number|Long|null);

        /** ContentHead msgTime */
        msgTime?: (number|Long|null);

        /** ContentHead pkgNum */
        pkgNum?: (number|null);

        /** ContentHead pkgIndex */
        pkgIndex?: (number|null);

        /** ContentHead divSeq */
        divSeq?: (number|null);

        /** ContentHead autoReply */
        autoReply?: (number|null);

        /** ContentHead ntMsgSeq */
        ntMsgSeq?: (number|Long|null);

        /** ContentHead msgUid */
        msgUid?: (number|Long|null);

        /** ContentHead field15 */
        field15?: (Msg.IContentHeadField15|null);
    }

    /** Represents a ContentHead. */
    class ContentHead implements IContentHead {

        /**
         * Constructs a new ContentHead.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IContentHead);

        /** ContentHead msgType. */
        public msgType?: (number|Long|null);

        /** ContentHead subType. */
        public subType?: (number|Long|null);

        /** ContentHead c2cCmd. */
        public c2cCmd?: (number|null);

        /** ContentHead random. */
        public random?: (number|Long|null);

        /** ContentHead msgSeq. */
        public msgSeq?: (number|Long|null);

        /** ContentHead msgTime. */
        public msgTime?: (number|Long|null);

        /** ContentHead pkgNum. */
        public pkgNum?: (number|null);

        /** ContentHead pkgIndex. */
        public pkgIndex?: (number|null);

        /** ContentHead divSeq. */
        public divSeq?: (number|null);

        /** ContentHead autoReply. */
        public autoReply?: (number|null);

        /** ContentHead ntMsgSeq. */
        public ntMsgSeq?: (number|Long|null);

        /** ContentHead msgUid. */
        public msgUid?: (number|Long|null);

        /** ContentHead field15. */
        public field15?: (Msg.IContentHeadField15|null);

        /**
         * Encodes the specified ContentHead message. Does not implicitly {@link Msg.ContentHead.verify|verify} messages.
         * @param message ContentHead message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IContentHead, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ContentHead message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns ContentHead
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.ContentHead;

        /**
         * Gets the default type url for ContentHead
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a ContentHeadField15. */
    interface IContentHeadField15 {

        /** ContentHeadField15 field1 */
        field1?: (number|null);

        /** ContentHeadField15 field2 */
        field2?: (number|null);

        /** ContentHeadField15 field3 */
        field3?: (number|null);

        /** ContentHeadField15 field4 */
        field4?: (string|null);

        /** ContentHeadField15 field5 */
        field5?: (string|null);
    }

    /** Represents a ContentHeadField15. */
    class ContentHeadField15 implements IContentHeadField15 {

        /**
         * Constructs a new ContentHeadField15.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IContentHeadField15);

        /** ContentHeadField15 field1. */
        public field1?: (number|null);

        /** ContentHeadField15 field2. */
        public field2?: (number|null);

        /** ContentHeadField15 field3. */
        public field3?: (number|null);

        /** ContentHeadField15 field4. */
        public field4?: (string|null);

        /** ContentHeadField15 field5. */
        public field5?: (string|null);

        /**
         * Encodes the specified ContentHeadField15 message. Does not implicitly {@link Msg.ContentHeadField15.verify|verify} messages.
         * @param message ContentHeadField15 message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IContentHeadField15, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a ContentHeadField15 message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns ContentHeadField15
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.ContentHeadField15;

        /**
         * Gets the default type url for ContentHeadField15
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a Message. */
    interface IMessage {

        /** Message routingHead */
        routingHead?: (Msg.IRoutingHead|null);

        /** Message contentHead */
        contentHead?: (Msg.IContentHead|null);

        /** Message body */
        body?: (Msg.IMessageBody|null);
    }

    /** Represents a Message. */
    class Message implements IMessage {

        /**
         * Constructs a new Message.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IMessage);

        /** Message routingHead. */
        public routingHead?: (Msg.IRoutingHead|null);

        /** Message contentHead. */
        public contentHead?: (Msg.IContentHead|null);

        /** Message body. */
        public body?: (Msg.IMessageBody|null);

        /**
         * Encodes the specified Message message. Does not implicitly {@link Msg.Message.verify|verify} messages.
         * @param message Message message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IMessage, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Message message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Message
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.Message;

        /**
         * Gets the default type url for Message
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a MessageBody. */
    interface IMessageBody {

        /** MessageBody richText */
        richText?: (Msg.IRichText|null);

        /** MessageBody msgContent */
        msgContent?: (Uint8Array|null);

        /** MessageBody msgEncryptContent */
        msgEncryptContent?: (Uint8Array|null);
    }

    /** Represents a MessageBody. */
    class MessageBody implements IMessageBody {

        /**
         * Constructs a new MessageBody.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IMessageBody);

        /** MessageBody richText. */
        public richText?: (Msg.IRichText|null);

        /** MessageBody msgContent. */
        public msgContent?: (Uint8Array|null);

        /** MessageBody msgEncryptContent. */
        public msgEncryptContent?: (Uint8Array|null);

        /**
         * Encodes the specified MessageBody message. Does not implicitly {@link Msg.MessageBody.verify|verify} messages.
         * @param message MessageBody message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IMessageBody, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a MessageBody message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns MessageBody
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.MessageBody;

        /**
         * Gets the default type url for MessageBody
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a RichText. */
    interface IRichText {

        /** RichText attr */
        attr?: (Msg.IAttr|null);

        /** RichText elems */
        elems?: (Msg.IElem[]|null);
    }

    /** Represents a RichText. */
    class RichText implements IRichText {

        /**
         * Constructs a new RichText.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IRichText);

        /** RichText attr. */
        public attr?: (Msg.IAttr|null);

        /** RichText elems. */
        public elems: Msg.IElem[];

        /**
         * Encodes the specified RichText message. Does not implicitly {@link Msg.RichText.verify|verify} messages.
         * @param message RichText message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IRichText, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a RichText message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns RichText
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.RichText;

        /**
         * Gets the default type url for RichText
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an Elem. */
    interface IElem {

        /** Elem text */
        text?: (Msg.IText|null);

        /** Elem face */
        face?: (Msg.IFace|null);

        /** Elem lightApp */
        lightApp?: (Msg.ILightAppElem|null);

        /** Elem commonElem */
        commonElem?: (Msg.ICommonElem|null);
    }

    /** Represents an Elem. */
    class Elem implements IElem {

        /**
         * Constructs a new Elem.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IElem);

        /** Elem text. */
        public text?: (Msg.IText|null);

        /** Elem face. */
        public face?: (Msg.IFace|null);

        /** Elem lightApp. */
        public lightApp?: (Msg.ILightAppElem|null);

        /** Elem commonElem. */
        public commonElem?: (Msg.ICommonElem|null);

        /**
         * Encodes the specified Elem message. Does not implicitly {@link Msg.Elem.verify|verify} messages.
         * @param message Elem message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IElem, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an Elem message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Elem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.Elem;

        /**
         * Gets the default type url for Elem
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a Text. */
    interface IText {

        /** Text str */
        str?: (string|null);

        /** Text link */
        link?: (string|null);

        /** Text attr6Buf */
        attr6Buf?: (Uint8Array|null);

        /** Text attr7Buf */
        attr7Buf?: (Uint8Array|null);

        /** Text buf */
        buf?: (Uint8Array|null);

        /** Text pbReserve */
        pbReserve?: (Uint8Array|null);
    }

    /** Represents a Text. */
    class Text implements IText {

        /**
         * Constructs a new Text.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IText);

        /** Text str. */
        public str?: (string|null);

        /** Text link. */
        public link?: (string|null);

        /** Text attr6Buf. */
        public attr6Buf?: (Uint8Array|null);

        /** Text attr7Buf. */
        public attr7Buf?: (Uint8Array|null);

        /** Text buf. */
        public buf?: (Uint8Array|null);

        /** Text pbReserve. */
        public pbReserve?: (Uint8Array|null);

        /**
         * Encodes the specified Text message. Does not implicitly {@link Msg.Text.verify|verify} messages.
         * @param message Text message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IText, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Text message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Text
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.Text;

        /**
         * Gets the default type url for Text
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a Face. */
    interface IFace {

        /** Face index */
        index?: (number|null);

        /** Face old */
        old?: (Uint8Array|null);

        /** Face buf */
        buf?: (Uint8Array|null);
    }

    /** Represents a Face. */
    class Face implements IFace {

        /**
         * Constructs a new Face.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IFace);

        /** Face index. */
        public index?: (number|null);

        /** Face old. */
        public old?: (Uint8Array|null);

        /** Face buf. */
        public buf?: (Uint8Array|null);

        /**
         * Encodes the specified Face message. Does not implicitly {@link Msg.Face.verify|verify} messages.
         * @param message Face message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IFace, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Face message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Face
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.Face;

        /**
         * Gets the default type url for Face
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a LightAppElem. */
    interface ILightAppElem {

        /** LightAppElem data */
        data?: (Uint8Array|null);

        /** LightAppElem msgResid */
        msgResid?: (Uint8Array|null);
    }

    /** Represents a LightAppElem. */
    class LightAppElem implements ILightAppElem {

        /**
         * Constructs a new LightAppElem.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.ILightAppElem);

        /** LightAppElem data. */
        public data?: (Uint8Array|null);

        /** LightAppElem msgResid. */
        public msgResid?: (Uint8Array|null);

        /**
         * Encodes the specified LightAppElem message. Does not implicitly {@link Msg.LightAppElem.verify|verify} messages.
         * @param message LightAppElem message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.ILightAppElem, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a LightAppElem message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns LightAppElem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.LightAppElem;

        /**
         * Gets the default type url for LightAppElem
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a CommonElem. */
    interface ICommonElem {

        /** CommonElem serviceType */
        serviceType?: (number|null);

        /** CommonElem pbElem */
        pbElem?: (Uint8Array|null);

        /** CommonElem businessType */
        businessType?: (number|null);
    }

    /** Represents a CommonElem. */
    class CommonElem implements ICommonElem {

        /**
         * Constructs a new CommonElem.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.ICommonElem);

        /** CommonElem serviceType. */
        public serviceType: number;

        /** CommonElem pbElem. */
        public pbElem?: (Uint8Array|null);

        /** CommonElem businessType. */
        public businessType?: (number|null);

        /**
         * Encodes the specified CommonElem message. Does not implicitly {@link Msg.CommonElem.verify|verify} messages.
         * @param message CommonElem message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.ICommonElem, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a CommonElem message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns CommonElem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.CommonElem;

        /**
         * Gets the default type url for CommonElem
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an Attr. */
    interface IAttr {

        /** Attr codePage */
        codePage?: (number|null);

        /** Attr time */
        time?: (number|null);

        /** Attr random */
        random?: (number|null);

        /** Attr color */
        color?: (number|null);

        /** Attr size */
        size?: (number|null);

        /** Attr effect */
        effect?: (number|null);

        /** Attr charSet */
        charSet?: (number|null);

        /** Attr pitchAndFamily */
        pitchAndFamily?: (number|null);

        /** Attr fontName */
        fontName?: (string|null);

        /** Attr reserveData */
        reserveData?: (Uint8Array|null);
    }

    /** Represents an Attr. */
    class Attr implements IAttr {

        /**
         * Constructs a new Attr.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IAttr);

        /** Attr codePage. */
        public codePage?: (number|null);

        /** Attr time. */
        public time?: (number|null);

        /** Attr random. */
        public random?: (number|null);

        /** Attr color. */
        public color?: (number|null);

        /** Attr size. */
        public size?: (number|null);

        /** Attr effect. */
        public effect?: (number|null);

        /** Attr charSet. */
        public charSet?: (number|null);

        /** Attr pitchAndFamily. */
        public pitchAndFamily?: (number|null);

        /** Attr fontName. */
        public fontName?: (string|null);

        /** Attr reserveData. */
        public reserveData?: (Uint8Array|null);

        /**
         * Encodes the specified Attr message. Does not implicitly {@link Msg.Attr.verify|verify} messages.
         * @param message Attr message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IAttr, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an Attr message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Attr
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.Attr;

        /**
         * Gets the default type url for Attr
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a MarkdownElem. */
    interface IMarkdownElem {

        /** MarkdownElem content */
        content?: (string|null);
    }

    /** Represents a MarkdownElem. */
    class MarkdownElem implements IMarkdownElem {

        /**
         * Constructs a new MarkdownElem.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IMarkdownElem);

        /** MarkdownElem content. */
        public content: string;

        /**
         * Encodes the specified MarkdownElem message. Does not implicitly {@link Msg.MarkdownElem.verify|verify} messages.
         * @param message MarkdownElem message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IMarkdownElem, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a MarkdownElem message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns MarkdownElem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.MarkdownElem;

        /**
         * Gets the default type url for MarkdownElem
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a PbMultiMsgItem. */
    interface IPbMultiMsgItem {

        /** PbMultiMsgItem fileName */
        fileName?: (string|null);

        /** PbMultiMsgItem buffer */
        buffer?: (Msg.IPbMultiMsgNew|null);
    }

    /** Represents a PbMultiMsgItem. */
    class PbMultiMsgItem implements IPbMultiMsgItem {

        /**
         * Constructs a new PbMultiMsgItem.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IPbMultiMsgItem);

        /** PbMultiMsgItem fileName. */
        public fileName: string;

        /** PbMultiMsgItem buffer. */
        public buffer?: (Msg.IPbMultiMsgNew|null);

        /**
         * Encodes the specified PbMultiMsgItem message. Does not implicitly {@link Msg.PbMultiMsgItem.verify|verify} messages.
         * @param message PbMultiMsgItem message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IPbMultiMsgItem, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PbMultiMsgItem message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PbMultiMsgItem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.PbMultiMsgItem;

        /**
         * Gets the default type url for PbMultiMsgItem
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a PbMultiMsgNew. */
    interface IPbMultiMsgNew {

        /** PbMultiMsgNew msg */
        msg?: (Msg.IMessage[]|null);
    }

    /** Represents a PbMultiMsgNew. */
    class PbMultiMsgNew implements IPbMultiMsgNew {

        /**
         * Constructs a new PbMultiMsgNew.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IPbMultiMsgNew);

        /** PbMultiMsgNew msg. */
        public msg: Msg.IMessage[];

        /**
         * Encodes the specified PbMultiMsgNew message. Does not implicitly {@link Msg.PbMultiMsgNew.verify|verify} messages.
         * @param message PbMultiMsgNew message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IPbMultiMsgNew, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PbMultiMsgNew message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PbMultiMsgNew
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.PbMultiMsgNew;

        /**
         * Gets the default type url for PbMultiMsgNew
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a PbMultiMsgTransmit. */
    interface IPbMultiMsgTransmit {

        /** PbMultiMsgTransmit msg */
        msg?: (Msg.IMessage[]|null);

        /** PbMultiMsgTransmit pbItemList */
        pbItemList?: (Msg.IPbMultiMsgItem[]|null);
    }

    /** Represents a PbMultiMsgTransmit. */
    class PbMultiMsgTransmit implements IPbMultiMsgTransmit {

        /**
         * Constructs a new PbMultiMsgTransmit.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.IPbMultiMsgTransmit);

        /** PbMultiMsgTransmit msg. */
        public msg: Msg.IMessage[];

        /** PbMultiMsgTransmit pbItemList. */
        public pbItemList: Msg.IPbMultiMsgItem[];

        /**
         * Encodes the specified PbMultiMsgTransmit message. Does not implicitly {@link Msg.PbMultiMsgTransmit.verify|verify} messages.
         * @param message PbMultiMsgTransmit message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.IPbMultiMsgTransmit, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PbMultiMsgTransmit message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PbMultiMsgTransmit
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.PbMultiMsgTransmit;

        /**
         * Gets the default type url for PbMultiMsgTransmit
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SendMsgRsp. */
    interface ISendMsgRsp {

        /** SendMsgRsp retCode */
        retCode?: (number|null);

        /** SendMsgRsp errMsg */
        errMsg?: (string|null);

        /** SendMsgRsp groupSeq */
        groupSeq?: (number|null);

        /** SendMsgRsp timestamp */
        timestamp?: (number|null);

        /** SendMsgRsp privateSeq */
        privateSeq?: (number|null);
    }

    /** Represents a SendMsgRsp. */
    class SendMsgRsp implements ISendMsgRsp {

        /**
         * Constructs a new SendMsgRsp.
         * @param [properties] Properties to set
         */
        constructor(properties?: Msg.ISendMsgRsp);

        /** SendMsgRsp retCode. */
        public retCode: number;

        /** SendMsgRsp errMsg. */
        public errMsg?: (string|null);

        /** SendMsgRsp groupSeq. */
        public groupSeq?: (number|null);

        /** SendMsgRsp timestamp. */
        public timestamp?: (number|null);

        /** SendMsgRsp privateSeq. */
        public privateSeq?: (number|null);

        /**
         * Encodes the specified SendMsgRsp message. Does not implicitly {@link Msg.SendMsgRsp.verify|verify} messages.
         * @param message SendMsgRsp message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Msg.ISendMsgRsp, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SendMsgRsp message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SendMsgRsp
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Msg.SendMsgRsp;

        /**
         * Gets the default type url for SendMsgRsp
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}

/** Namespace RichMedia. */
export namespace RichMedia {

    /** Properties of a MsgInfo. */
    interface IMsgInfo {

        /** MsgInfo msgInfoBody */
        msgInfoBody?: (RichMedia.IMsgInfoBody[]|null);

        /** MsgInfo extBizInfo */
        extBizInfo?: (RichMedia.IExtBizInfo|null);
    }

    /** Represents a MsgInfo. */
    class MsgInfo implements IMsgInfo {

        /**
         * Constructs a new MsgInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: RichMedia.IMsgInfo);

        /** MsgInfo msgInfoBody. */
        public msgInfoBody: RichMedia.IMsgInfoBody[];

        /** MsgInfo extBizInfo. */
        public extBizInfo?: (RichMedia.IExtBizInfo|null);

        /**
         * Encodes the specified MsgInfo message. Does not implicitly {@link RichMedia.MsgInfo.verify|verify} messages.
         * @param message MsgInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: RichMedia.IMsgInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a MsgInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns MsgInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RichMedia.MsgInfo;

        /**
         * Gets the default type url for MsgInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a MsgInfoBody. */
    interface IMsgInfoBody {

        /** MsgInfoBody index */
        index?: (RichMedia.IIndexNode|null);

        /** MsgInfoBody pic */
        pic?: (RichMedia.IPicInfo|null);

        /** MsgInfoBody fileExist */
        fileExist?: (boolean|null);
    }

    /** Represents a MsgInfoBody. */
    class MsgInfoBody implements IMsgInfoBody {

        /**
         * Constructs a new MsgInfoBody.
         * @param [properties] Properties to set
         */
        constructor(properties?: RichMedia.IMsgInfoBody);

        /** MsgInfoBody index. */
        public index?: (RichMedia.IIndexNode|null);

        /** MsgInfoBody pic. */
        public pic?: (RichMedia.IPicInfo|null);

        /** MsgInfoBody fileExist. */
        public fileExist: boolean;

        /**
         * Encodes the specified MsgInfoBody message. Does not implicitly {@link RichMedia.MsgInfoBody.verify|verify} messages.
         * @param message MsgInfoBody message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: RichMedia.IMsgInfoBody, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a MsgInfoBody message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns MsgInfoBody
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RichMedia.MsgInfoBody;

        /**
         * Gets the default type url for MsgInfoBody
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an IndexNode. */
    interface IIndexNode {

        /** IndexNode info */
        info?: (RichMedia.IFileInfo|null);

        /** IndexNode fileUuid */
        fileUuid?: (string|null);

        /** IndexNode storeID */
        storeID?: (number|null);

        /** IndexNode uploadTime */
        uploadTime?: (number|null);

        /** IndexNode expire */
        expire?: (number|null);

        /** IndexNode type */
        type?: (number|null);
    }

    /** Represents an IndexNode. */
    class IndexNode implements IIndexNode {

        /**
         * Constructs a new IndexNode.
         * @param [properties] Properties to set
         */
        constructor(properties?: RichMedia.IIndexNode);

        /** IndexNode info. */
        public info?: (RichMedia.IFileInfo|null);

        /** IndexNode fileUuid. */
        public fileUuid: string;

        /** IndexNode storeID. */
        public storeID: number;

        /** IndexNode uploadTime. */
        public uploadTime: number;

        /** IndexNode expire. */
        public expire: number;

        /** IndexNode type. */
        public type: number;

        /**
         * Encodes the specified IndexNode message. Does not implicitly {@link RichMedia.IndexNode.verify|verify} messages.
         * @param message IndexNode message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: RichMedia.IIndexNode, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an IndexNode message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns IndexNode
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RichMedia.IndexNode;

        /**
         * Gets the default type url for IndexNode
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a FileInfo. */
    interface IFileInfo {

        /** FileInfo fileSize */
        fileSize?: (number|null);

        /** FileInfo md5HexStr */
        md5HexStr?: (string|null);

        /** FileInfo sha1HexStr */
        sha1HexStr?: (string|null);

        /** FileInfo fileName */
        fileName?: (string|null);

        /** FileInfo fileType */
        fileType?: (RichMedia.IFileType|null);

        /** FileInfo width */
        width?: (number|null);

        /** FileInfo height */
        height?: (number|null);

        /** FileInfo time */
        time?: (number|null);

        /** FileInfo original */
        original?: (number|null);
    }

    /** Represents a FileInfo. */
    class FileInfo implements IFileInfo {

        /**
         * Constructs a new FileInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: RichMedia.IFileInfo);

        /** FileInfo fileSize. */
        public fileSize: number;

        /** FileInfo md5HexStr. */
        public md5HexStr: string;

        /** FileInfo sha1HexStr. */
        public sha1HexStr: string;

        /** FileInfo fileName. */
        public fileName: string;

        /** FileInfo fileType. */
        public fileType?: (RichMedia.IFileType|null);

        /** FileInfo width. */
        public width: number;

        /** FileInfo height. */
        public height: number;

        /** FileInfo time. */
        public time: number;

        /** FileInfo original. */
        public original: number;

        /**
         * Encodes the specified FileInfo message. Does not implicitly {@link RichMedia.FileInfo.verify|verify} messages.
         * @param message FileInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: RichMedia.IFileInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns FileInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RichMedia.FileInfo;

        /**
         * Gets the default type url for FileInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a FileType. */
    interface IFileType {

        /** FileType type */
        type?: (number|null);

        /** FileType picFormat */
        picFormat?: (number|null);

        /** FileType videoFormat */
        videoFormat?: (number|null);

        /** FileType pttFormat */
        pttFormat?: (number|null);
    }

    /** Represents a FileType. */
    class FileType implements IFileType {

        /**
         * Constructs a new FileType.
         * @param [properties] Properties to set
         */
        constructor(properties?: RichMedia.IFileType);

        /** FileType type. */
        public type: number;

        /** FileType picFormat. */
        public picFormat: number;

        /** FileType videoFormat. */
        public videoFormat: number;

        /** FileType pttFormat. */
        public pttFormat: number;

        /**
         * Encodes the specified FileType message. Does not implicitly {@link RichMedia.FileType.verify|verify} messages.
         * @param message FileType message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: RichMedia.IFileType, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FileType message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns FileType
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RichMedia.FileType;

        /**
         * Gets the default type url for FileType
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a PicInfo. */
    interface IPicInfo {

        /** PicInfo urlPath */
        urlPath?: (string|null);

        /** PicInfo ext */
        ext?: (RichMedia.IPicUrlExtParams|null);

        /** PicInfo domain */
        domain?: (string|null);
    }

    /** Represents a PicInfo. */
    class PicInfo implements IPicInfo {

        /**
         * Constructs a new PicInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: RichMedia.IPicInfo);

        /** PicInfo urlPath. */
        public urlPath: string;

        /** PicInfo ext. */
        public ext?: (RichMedia.IPicUrlExtParams|null);

        /** PicInfo domain. */
        public domain: string;

        /**
         * Encodes the specified PicInfo message. Does not implicitly {@link RichMedia.PicInfo.verify|verify} messages.
         * @param message PicInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: RichMedia.IPicInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PicInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PicInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RichMedia.PicInfo;

        /**
         * Gets the default type url for PicInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a PicUrlExtParams. */
    interface IPicUrlExtParams {

        /** PicUrlExtParams originalParam */
        originalParam?: (string|null);

        /** PicUrlExtParams bigParam */
        bigParam?: (string|null);

        /** PicUrlExtParams thumbParam */
        thumbParam?: (string|null);
    }

    /** Represents a PicUrlExtParams. */
    class PicUrlExtParams implements IPicUrlExtParams {

        /**
         * Constructs a new PicUrlExtParams.
         * @param [properties] Properties to set
         */
        constructor(properties?: RichMedia.IPicUrlExtParams);

        /** PicUrlExtParams originalParam. */
        public originalParam: string;

        /** PicUrlExtParams bigParam. */
        public bigParam: string;

        /** PicUrlExtParams thumbParam. */
        public thumbParam: string;

        /**
         * Encodes the specified PicUrlExtParams message. Does not implicitly {@link RichMedia.PicUrlExtParams.verify|verify} messages.
         * @param message PicUrlExtParams message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: RichMedia.IPicUrlExtParams, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PicUrlExtParams message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PicUrlExtParams
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RichMedia.PicUrlExtParams;

        /**
         * Gets the default type url for PicUrlExtParams
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an ExtBizInfo. */
    interface IExtBizInfo {

        /** ExtBizInfo pic */
        pic?: (RichMedia.IPicExtBizInfo|null);

        /** ExtBizInfo video */
        video?: (RichMedia.IVideoExtBizInfo|null);

        /** ExtBizInfo busiType */
        busiType?: (number|null);
    }

    /** Represents an ExtBizInfo. */
    class ExtBizInfo implements IExtBizInfo {

        /**
         * Constructs a new ExtBizInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: RichMedia.IExtBizInfo);

        /** ExtBizInfo pic. */
        public pic?: (RichMedia.IPicExtBizInfo|null);

        /** ExtBizInfo video. */
        public video?: (RichMedia.IVideoExtBizInfo|null);

        /** ExtBizInfo busiType. */
        public busiType: number;

        /**
         * Encodes the specified ExtBizInfo message. Does not implicitly {@link RichMedia.ExtBizInfo.verify|verify} messages.
         * @param message ExtBizInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: RichMedia.IExtBizInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an ExtBizInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns ExtBizInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RichMedia.ExtBizInfo;

        /**
         * Gets the default type url for ExtBizInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a PicExtBizInfo. */
    interface IPicExtBizInfo {

        /** PicExtBizInfo bizType */
        bizType?: (number|null);

        /** PicExtBizInfo summary */
        summary?: (string|null);
    }

    /** Represents a PicExtBizInfo. */
    class PicExtBizInfo implements IPicExtBizInfo {

        /**
         * Constructs a new PicExtBizInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: RichMedia.IPicExtBizInfo);

        /** PicExtBizInfo bizType. */
        public bizType: number;

        /** PicExtBizInfo summary. */
        public summary: string;

        /**
         * Encodes the specified PicExtBizInfo message. Does not implicitly {@link RichMedia.PicExtBizInfo.verify|verify} messages.
         * @param message PicExtBizInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: RichMedia.IPicExtBizInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PicExtBizInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PicExtBizInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RichMedia.PicExtBizInfo;

        /**
         * Gets the default type url for PicExtBizInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a VideoExtBizInfo. */
    interface IVideoExtBizInfo {

        /** VideoExtBizInfo pbReserve */
        pbReserve?: (Uint8Array|null);
    }

    /** Represents a VideoExtBizInfo. */
    class VideoExtBizInfo implements IVideoExtBizInfo {

        /**
         * Constructs a new VideoExtBizInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: RichMedia.IVideoExtBizInfo);

        /** VideoExtBizInfo pbReserve. */
        public pbReserve: Uint8Array;

        /**
         * Encodes the specified VideoExtBizInfo message. Does not implicitly {@link RichMedia.VideoExtBizInfo.verify|verify} messages.
         * @param message VideoExtBizInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: RichMedia.IVideoExtBizInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a VideoExtBizInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns VideoExtBizInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RichMedia.VideoExtBizInfo;

        /**
         * Gets the default type url for VideoExtBizInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a PicFileIdInfo. */
    interface IPicFileIdInfo {

        /** PicFileIdInfo sha1 */
        sha1?: (Uint8Array|null);

        /** PicFileIdInfo size */
        size?: (number|null);

        /** PicFileIdInfo appid */
        appid?: (number|null);

        /** PicFileIdInfo time */
        time?: (number|null);

        /** PicFileIdInfo expire */
        expire?: (number|null);
    }

    /** Represents a PicFileIdInfo. */
    class PicFileIdInfo implements IPicFileIdInfo {

        /**
         * Constructs a new PicFileIdInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: RichMedia.IPicFileIdInfo);

        /** PicFileIdInfo sha1. */
        public sha1: Uint8Array;

        /** PicFileIdInfo size. */
        public size: number;

        /** PicFileIdInfo appid. */
        public appid: number;

        /** PicFileIdInfo time. */
        public time: number;

        /** PicFileIdInfo expire. */
        public expire: number;

        /**
         * Encodes the specified PicFileIdInfo message. Does not implicitly {@link RichMedia.PicFileIdInfo.verify|verify} messages.
         * @param message PicFileIdInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: RichMedia.IPicFileIdInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PicFileIdInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PicFileIdInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): RichMedia.PicFileIdInfo;

        /**
         * Gets the default type url for PicFileIdInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}

/** Namespace Oidb. */
export namespace Oidb {

    /** Properties of a Base. */
    interface IBase {

        /** Base command */
        command?: (number|null);

        /** Base subCommand */
        subCommand?: (number|null);

        /** Base errorCode */
        errorCode?: (number|null);

        /** Base body */
        body?: (Uint8Array|null);

        /** Base errorMsg */
        errorMsg?: (string|null);

        /** Base isReserved */
        isReserved?: (number|null);
    }

    /** Represents a Base. */
    class Base implements IBase {

        /**
         * Constructs a new Base.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.IBase);

        /** Base command. */
        public command: number;

        /** Base subCommand. */
        public subCommand: number;

        /** Base errorCode. */
        public errorCode: number;

        /** Base body. */
        public body: Uint8Array;

        /** Base errorMsg. */
        public errorMsg: string;

        /** Base isReserved. */
        public isReserved: number;

        /**
         * Encodes the specified Base message. Does not implicitly {@link Oidb.Base.verify|verify} messages.
         * @param message Base message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.IBase, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a Base message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Base
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.Base;

        /**
         * Gets the default type url for Base
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SendPoke. */
    interface ISendPoke {

        /** SendPoke toUin */
        toUin?: (number|null);

        /** SendPoke groupCode */
        groupCode?: (number|null);

        /** SendPoke friendUin */
        friendUin?: (number|null);
    }

    /** Represents a SendPoke. */
    class SendPoke implements ISendPoke {

        /**
         * Constructs a new SendPoke.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.ISendPoke);

        /** SendPoke toUin. */
        public toUin: number;

        /** SendPoke groupCode. */
        public groupCode: number;

        /** SendPoke friendUin. */
        public friendUin: number;

        /**
         * Encodes the specified SendPoke message. Does not implicitly {@link Oidb.SendPoke.verify|verify} messages.
         * @param message SendPoke message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.ISendPoke, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SendPoke message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SendPoke
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.SendPoke;

        /**
         * Gets the default type url for SendPoke
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SetSpecialTitleBody. */
    interface ISetSpecialTitleBody {

        /** SetSpecialTitleBody targetUid */
        targetUid?: (string|null);

        /** SetSpecialTitleBody specialTitle */
        specialTitle?: (string|null);

        /** SetSpecialTitleBody expireTime */
        expireTime?: (number|null);

        /** SetSpecialTitleBody uidName */
        uidName?: (string|null);
    }

    /** Represents a SetSpecialTitleBody. */
    class SetSpecialTitleBody implements ISetSpecialTitleBody {

        /**
         * Constructs a new SetSpecialTitleBody.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.ISetSpecialTitleBody);

        /** SetSpecialTitleBody targetUid. */
        public targetUid: string;

        /** SetSpecialTitleBody specialTitle. */
        public specialTitle: string;

        /** SetSpecialTitleBody expireTime. */
        public expireTime: number;

        /** SetSpecialTitleBody uidName. */
        public uidName: string;

        /**
         * Encodes the specified SetSpecialTitleBody message. Does not implicitly {@link Oidb.SetSpecialTitleBody.verify|verify} messages.
         * @param message SetSpecialTitleBody message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.ISetSpecialTitleBody, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SetSpecialTitleBody message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SetSpecialTitleBody
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.SetSpecialTitleBody;

        /**
         * Gets the default type url for SetSpecialTitleBody
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SetSpecialTitle. */
    interface ISetSpecialTitle {

        /** SetSpecialTitle groupCode */
        groupCode?: (number|null);

        /** SetSpecialTitle body */
        body?: (Oidb.ISetSpecialTitleBody|null);
    }

    /** Represents a SetSpecialTitle. */
    class SetSpecialTitle implements ISetSpecialTitle {

        /**
         * Constructs a new SetSpecialTitle.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.ISetSpecialTitle);

        /** SetSpecialTitle groupCode. */
        public groupCode: number;

        /** SetSpecialTitle body. */
        public body?: (Oidb.ISetSpecialTitleBody|null);

        /**
         * Encodes the specified SetSpecialTitle message. Does not implicitly {@link Oidb.SetSpecialTitle.verify|verify} messages.
         * @param message SetSpecialTitle message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.ISetSpecialTitle, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SetSpecialTitle message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SetSpecialTitle
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.SetSpecialTitle;

        /**
         * Gets the default type url for SetSpecialTitle
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a GetRKeyResponseItem. */
    interface IGetRKeyResponseItem {

        /** GetRKeyResponseItem rkey */
        rkey?: (string|null);

        /** GetRKeyResponseItem ttlSec */
        ttlSec?: (number|null);

        /** GetRKeyResponseItem storeId */
        storeId?: (number|null);

        /** GetRKeyResponseItem createTime */
        createTime?: (number|null);

        /** GetRKeyResponseItem type */
        type?: (number|null);
    }

    /** Represents a GetRKeyResponseItem. */
    class GetRKeyResponseItem implements IGetRKeyResponseItem {

        /**
         * Constructs a new GetRKeyResponseItem.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.IGetRKeyResponseItem);

        /** GetRKeyResponseItem rkey. */
        public rkey: string;

        /** GetRKeyResponseItem ttlSec. */
        public ttlSec: number;

        /** GetRKeyResponseItem storeId. */
        public storeId: number;

        /** GetRKeyResponseItem createTime. */
        public createTime: number;

        /** GetRKeyResponseItem type. */
        public type: number;

        /**
         * Encodes the specified GetRKeyResponseItem message. Does not implicitly {@link Oidb.GetRKeyResponseItem.verify|verify} messages.
         * @param message GetRKeyResponseItem message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.IGetRKeyResponseItem, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a GetRKeyResponseItem message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns GetRKeyResponseItem
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.GetRKeyResponseItem;

        /**
         * Gets the default type url for GetRKeyResponseItem
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a GetRKeyResponseItems. */
    interface IGetRKeyResponseItems {

        /** GetRKeyResponseItems rkeyItems */
        rkeyItems?: (Oidb.IGetRKeyResponseItem[]|null);
    }

    /** Represents a GetRKeyResponseItems. */
    class GetRKeyResponseItems implements IGetRKeyResponseItems {

        /**
         * Constructs a new GetRKeyResponseItems.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.IGetRKeyResponseItems);

        /** GetRKeyResponseItems rkeyItems. */
        public rkeyItems: Oidb.IGetRKeyResponseItem[];

        /**
         * Encodes the specified GetRKeyResponseItems message. Does not implicitly {@link Oidb.GetRKeyResponseItems.verify|verify} messages.
         * @param message GetRKeyResponseItems message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.IGetRKeyResponseItems, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a GetRKeyResponseItems message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns GetRKeyResponseItems
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.GetRKeyResponseItems;

        /**
         * Gets the default type url for GetRKeyResponseItems
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a GetRKeyResponseBody. */
    interface IGetRKeyResponseBody {

        /** GetRKeyResponseBody result */
        result?: (Oidb.IGetRKeyResponseItems|null);
    }

    /** Represents a GetRKeyResponseBody. */
    class GetRKeyResponseBody implements IGetRKeyResponseBody {

        /**
         * Constructs a new GetRKeyResponseBody.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.IGetRKeyResponseBody);

        /** GetRKeyResponseBody result. */
        public result?: (Oidb.IGetRKeyResponseItems|null);

        /**
         * Encodes the specified GetRKeyResponseBody message. Does not implicitly {@link Oidb.GetRKeyResponseBody.verify|verify} messages.
         * @param message GetRKeyResponseBody message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.IGetRKeyResponseBody, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a GetRKeyResponseBody message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns GetRKeyResponseBody
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.GetRKeyResponseBody;

        /**
         * Gets the default type url for GetRKeyResponseBody
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a FetchUserInfo. */
    interface IFetchUserInfo {

        /** FetchUserInfo uin */
        uin?: (number|null);

        /** FetchUserInfo field2 */
        field2?: (number|null);

        /** FetchUserInfo keys */
        keys?: (Oidb.IFetchUserInfoKey[]|null);
    }

    /** Represents a FetchUserInfo. */
    class FetchUserInfo implements IFetchUserInfo {

        /**
         * Constructs a new FetchUserInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.IFetchUserInfo);

        /** FetchUserInfo uin. */
        public uin: number;

        /** FetchUserInfo field2. */
        public field2: number;

        /** FetchUserInfo keys. */
        public keys: Oidb.IFetchUserInfoKey[];

        /**
         * Encodes the specified FetchUserInfo message. Does not implicitly {@link Oidb.FetchUserInfo.verify|verify} messages.
         * @param message FetchUserInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.IFetchUserInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FetchUserInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns FetchUserInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.FetchUserInfo;

        /**
         * Gets the default type url for FetchUserInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a FetchUserInfoKey. */
    interface IFetchUserInfoKey {

        /** FetchUserInfoKey key */
        key?: (number|null);
    }

    /** Represents a FetchUserInfoKey. */
    class FetchUserInfoKey implements IFetchUserInfoKey {

        /**
         * Constructs a new FetchUserInfoKey.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.IFetchUserInfoKey);

        /** FetchUserInfoKey key. */
        public key: number;

        /**
         * Encodes the specified FetchUserInfoKey message. Does not implicitly {@link Oidb.FetchUserInfoKey.verify|verify} messages.
         * @param message FetchUserInfoKey message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.IFetchUserInfoKey, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FetchUserInfoKey message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns FetchUserInfoKey
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.FetchUserInfoKey;

        /**
         * Gets the default type url for FetchUserInfoKey
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a FetchUserInfoResponse. */
    interface IFetchUserInfoResponse {

        /** FetchUserInfoResponse body */
        body?: (Oidb.IFetchUserInfoResponseBody|null);
    }

    /** Represents a FetchUserInfoResponse. */
    class FetchUserInfoResponse implements IFetchUserInfoResponse {

        /**
         * Constructs a new FetchUserInfoResponse.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.IFetchUserInfoResponse);

        /** FetchUserInfoResponse body. */
        public body?: (Oidb.IFetchUserInfoResponseBody|null);

        /**
         * Encodes the specified FetchUserInfoResponse message. Does not implicitly {@link Oidb.FetchUserInfoResponse.verify|verify} messages.
         * @param message FetchUserInfoResponse message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.IFetchUserInfoResponse, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FetchUserInfoResponse message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns FetchUserInfoResponse
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.FetchUserInfoResponse;

        /**
         * Gets the default type url for FetchUserInfoResponse
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a FetchUserInfoResponseBody. */
    interface IFetchUserInfoResponseBody {

        /** FetchUserInfoResponseBody properties */
        properties?: (Oidb.IFetchUserInfoResponseProperty|null);

        /** FetchUserInfoResponseBody uin */
        uin?: (number|null);
    }

    /** Represents a FetchUserInfoResponseBody. */
    class FetchUserInfoResponseBody implements IFetchUserInfoResponseBody {

        /**
         * Constructs a new FetchUserInfoResponseBody.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.IFetchUserInfoResponseBody);

        /** FetchUserInfoResponseBody properties. */
        public properties?: (Oidb.IFetchUserInfoResponseProperty|null);

        /** FetchUserInfoResponseBody uin. */
        public uin: number;

        /**
         * Encodes the specified FetchUserInfoResponseBody message. Does not implicitly {@link Oidb.FetchUserInfoResponseBody.verify|verify} messages.
         * @param message FetchUserInfoResponseBody message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.IFetchUserInfoResponseBody, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FetchUserInfoResponseBody message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns FetchUserInfoResponseBody
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.FetchUserInfoResponseBody;

        /**
         * Gets the default type url for FetchUserInfoResponseBody
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a FetchUserInfoResponseProperty. */
    interface IFetchUserInfoResponseProperty {

        /** FetchUserInfoResponseProperty numberProperties */
        numberProperties?: (Oidb.IOidbUserNumberProperty[]|null);

        /** FetchUserInfoResponseProperty bytesProperties */
        bytesProperties?: (Oidb.IOidbUserByteProperty[]|null);
    }

    /** Represents a FetchUserInfoResponseProperty. */
    class FetchUserInfoResponseProperty implements IFetchUserInfoResponseProperty {

        /**
         * Constructs a new FetchUserInfoResponseProperty.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.IFetchUserInfoResponseProperty);

        /** FetchUserInfoResponseProperty numberProperties. */
        public numberProperties: Oidb.IOidbUserNumberProperty[];

        /** FetchUserInfoResponseProperty bytesProperties. */
        public bytesProperties: Oidb.IOidbUserByteProperty[];

        /**
         * Encodes the specified FetchUserInfoResponseProperty message. Does not implicitly {@link Oidb.FetchUserInfoResponseProperty.verify|verify} messages.
         * @param message FetchUserInfoResponseProperty message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.IFetchUserInfoResponseProperty, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a FetchUserInfoResponseProperty message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns FetchUserInfoResponseProperty
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.FetchUserInfoResponseProperty;

        /**
         * Gets the default type url for FetchUserInfoResponseProperty
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an OidbUserNumberProperty. */
    interface IOidbUserNumberProperty {

        /** OidbUserNumberProperty key */
        key?: (number|null);

        /** OidbUserNumberProperty value */
        value?: (number|null);
    }

    /** Represents an OidbUserNumberProperty. */
    class OidbUserNumberProperty implements IOidbUserNumberProperty {

        /**
         * Constructs a new OidbUserNumberProperty.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.IOidbUserNumberProperty);

        /** OidbUserNumberProperty key. */
        public key: number;

        /** OidbUserNumberProperty value. */
        public value: number;

        /**
         * Encodes the specified OidbUserNumberProperty message. Does not implicitly {@link Oidb.OidbUserNumberProperty.verify|verify} messages.
         * @param message OidbUserNumberProperty message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.IOidbUserNumberProperty, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an OidbUserNumberProperty message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns OidbUserNumberProperty
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.OidbUserNumberProperty;

        /**
         * Gets the default type url for OidbUserNumberProperty
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of an OidbUserByteProperty. */
    interface IOidbUserByteProperty {

        /** OidbUserByteProperty key */
        key?: (number|null);

        /** OidbUserByteProperty value */
        value?: (Uint8Array|null);
    }

    /** Represents an OidbUserByteProperty. */
    class OidbUserByteProperty implements IOidbUserByteProperty {

        /**
         * Constructs a new OidbUserByteProperty.
         * @param [properties] Properties to set
         */
        constructor(properties?: Oidb.IOidbUserByteProperty);

        /** OidbUserByteProperty key. */
        public key: number;

        /** OidbUserByteProperty value. */
        public value: Uint8Array;

        /**
         * Encodes the specified OidbUserByteProperty message. Does not implicitly {@link Oidb.OidbUserByteProperty.verify|verify} messages.
         * @param message OidbUserByteProperty message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Oidb.IOidbUserByteProperty, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes an OidbUserByteProperty message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns OidbUserByteProperty
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Oidb.OidbUserByteProperty;

        /**
         * Gets the default type url for OidbUserByteProperty
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}

/** Namespace Action. */
export namespace Action {

    /** Properties of a SendLongMsgReq. */
    interface ISendLongMsgReq {

        /** SendLongMsgReq info */
        info?: (Action.ISendLongMsgInfo|null);

        /** SendLongMsgReq settings */
        settings?: (Action.ILongMsgSettings|null);
    }

    /** Represents a SendLongMsgReq. */
    class SendLongMsgReq implements ISendLongMsgReq {

        /**
         * Constructs a new SendLongMsgReq.
         * @param [properties] Properties to set
         */
        constructor(properties?: Action.ISendLongMsgReq);

        /** SendLongMsgReq info. */
        public info?: (Action.ISendLongMsgInfo|null);

        /** SendLongMsgReq settings. */
        public settings?: (Action.ILongMsgSettings|null);

        /**
         * Encodes the specified SendLongMsgReq message. Does not implicitly {@link Action.SendLongMsgReq.verify|verify} messages.
         * @param message SendLongMsgReq message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Action.ISendLongMsgReq, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SendLongMsgReq message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SendLongMsgReq
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Action.SendLongMsgReq;

        /**
         * Gets the default type url for SendLongMsgReq
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SendLongMsgInfo. */
    interface ISendLongMsgInfo {

        /** SendLongMsgInfo type */
        type?: (number|null);

        /** SendLongMsgInfo peer */
        peer?: (Action.ILongMsgPeer|null);

        /** SendLongMsgInfo groupCode */
        groupCode?: (number|null);

        /** SendLongMsgInfo payload */
        payload?: (Uint8Array|null);
    }

    /** Represents a SendLongMsgInfo. */
    class SendLongMsgInfo implements ISendLongMsgInfo {

        /**
         * Constructs a new SendLongMsgInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: Action.ISendLongMsgInfo);

        /** SendLongMsgInfo type. */
        public type: number;

        /** SendLongMsgInfo peer. */
        public peer?: (Action.ILongMsgPeer|null);

        /** SendLongMsgInfo groupCode. */
        public groupCode: number;

        /** SendLongMsgInfo payload. */
        public payload: Uint8Array;

        /**
         * Encodes the specified SendLongMsgInfo message. Does not implicitly {@link Action.SendLongMsgInfo.verify|verify} messages.
         * @param message SendLongMsgInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Action.ISendLongMsgInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SendLongMsgInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SendLongMsgInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Action.SendLongMsgInfo;

        /**
         * Gets the default type url for SendLongMsgInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a LongMsgPeer. */
    interface ILongMsgPeer {

        /** LongMsgPeer uid */
        uid?: (string|null);
    }

    /** Represents a LongMsgPeer. */
    class LongMsgPeer implements ILongMsgPeer {

        /**
         * Constructs a new LongMsgPeer.
         * @param [properties] Properties to set
         */
        constructor(properties?: Action.ILongMsgPeer);

        /** LongMsgPeer uid. */
        public uid: string;

        /**
         * Encodes the specified LongMsgPeer message. Does not implicitly {@link Action.LongMsgPeer.verify|verify} messages.
         * @param message LongMsgPeer message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Action.ILongMsgPeer, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a LongMsgPeer message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns LongMsgPeer
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Action.LongMsgPeer;

        /**
         * Gets the default type url for LongMsgPeer
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a LongMsgSettings. */
    interface ILongMsgSettings {

        /** LongMsgSettings field1 */
        field1?: (number|null);

        /** LongMsgSettings field2 */
        field2?: (number|null);

        /** LongMsgSettings field3 */
        field3?: (number|null);

        /** LongMsgSettings field4 */
        field4?: (number|null);
    }

    /** Represents a LongMsgSettings. */
    class LongMsgSettings implements ILongMsgSettings {

        /**
         * Constructs a new LongMsgSettings.
         * @param [properties] Properties to set
         */
        constructor(properties?: Action.ILongMsgSettings);

        /** LongMsgSettings field1. */
        public field1: number;

        /** LongMsgSettings field2. */
        public field2: number;

        /** LongMsgSettings field3. */
        public field3: number;

        /** LongMsgSettings field4. */
        public field4: number;

        /**
         * Encodes the specified LongMsgSettings message. Does not implicitly {@link Action.LongMsgSettings.verify|verify} messages.
         * @param message LongMsgSettings message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Action.ILongMsgSettings, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a LongMsgSettings message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns LongMsgSettings
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Action.LongMsgSettings;

        /**
         * Gets the default type url for LongMsgSettings
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SendLongMsgResp. */
    interface ISendLongMsgResp {

        /** SendLongMsgResp result */
        result?: (Action.ISendLongMsgResult|null);

        /** SendLongMsgResp settings */
        settings?: (Action.ILongMsgSettings|null);
    }

    /** Represents a SendLongMsgResp. */
    class SendLongMsgResp implements ISendLongMsgResp {

        /**
         * Constructs a new SendLongMsgResp.
         * @param [properties] Properties to set
         */
        constructor(properties?: Action.ISendLongMsgResp);

        /** SendLongMsgResp result. */
        public result?: (Action.ISendLongMsgResult|null);

        /** SendLongMsgResp settings. */
        public settings?: (Action.ILongMsgSettings|null);

        /**
         * Encodes the specified SendLongMsgResp message. Does not implicitly {@link Action.SendLongMsgResp.verify|verify} messages.
         * @param message SendLongMsgResp message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Action.ISendLongMsgResp, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SendLongMsgResp message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SendLongMsgResp
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Action.SendLongMsgResp;

        /**
         * Gets the default type url for SendLongMsgResp
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a SendLongMsgResult. */
    interface ISendLongMsgResult {

        /** SendLongMsgResult resId */
        resId?: (string|null);
    }

    /** Represents a SendLongMsgResult. */
    class SendLongMsgResult implements ISendLongMsgResult {

        /**
         * Constructs a new SendLongMsgResult.
         * @param [properties] Properties to set
         */
        constructor(properties?: Action.ISendLongMsgResult);

        /** SendLongMsgResult resId. */
        public resId: string;

        /**
         * Encodes the specified SendLongMsgResult message. Does not implicitly {@link Action.SendLongMsgResult.verify|verify} messages.
         * @param message SendLongMsgResult message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Action.ISendLongMsgResult, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SendLongMsgResult message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SendLongMsgResult
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Action.SendLongMsgResult;

        /**
         * Gets the default type url for SendLongMsgResult
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a PullPicsReq. */
    interface IPullPicsReq {

        /** PullPicsReq uin */
        uin?: (number|null);

        /** PullPicsReq field3 */
        field3?: (number|null);

        /** PullPicsReq word */
        word?: (string|null);

        /** PullPicsReq word2 */
        word2?: (string|null);

        /** PullPicsReq field8 */
        field8?: (number|null);

        /** PullPicsReq field9 */
        field9?: (number|null);

        /** PullPicsReq field14 */
        field14?: (number|null);
    }

    /** Represents a PullPicsReq. */
    class PullPicsReq implements IPullPicsReq {

        /**
         * Constructs a new PullPicsReq.
         * @param [properties] Properties to set
         */
        constructor(properties?: Action.IPullPicsReq);

        /** PullPicsReq uin. */
        public uin: number;

        /** PullPicsReq field3. */
        public field3: number;

        /** PullPicsReq word. */
        public word: string;

        /** PullPicsReq word2. */
        public word2: string;

        /** PullPicsReq field8. */
        public field8: number;

        /** PullPicsReq field9. */
        public field9: number;

        /** PullPicsReq field14. */
        public field14: number;

        /**
         * Encodes the specified PullPicsReq message. Does not implicitly {@link Action.PullPicsReq.verify|verify} messages.
         * @param message PullPicsReq message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Action.IPullPicsReq, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PullPicsReq message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PullPicsReq
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Action.PullPicsReq;

        /**
         * Gets the default type url for PullPicsReq
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a PullPicsImgInfo. */
    interface IPullPicsImgInfo {

        /** PullPicsImgInfo url */
        url?: (string|null);
    }

    /** Represents a PullPicsImgInfo. */
    class PullPicsImgInfo implements IPullPicsImgInfo {

        /**
         * Constructs a new PullPicsImgInfo.
         * @param [properties] Properties to set
         */
        constructor(properties?: Action.IPullPicsImgInfo);

        /** PullPicsImgInfo url. */
        public url: string;

        /**
         * Encodes the specified PullPicsImgInfo message. Does not implicitly {@link Action.PullPicsImgInfo.verify|verify} messages.
         * @param message PullPicsImgInfo message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Action.IPullPicsImgInfo, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PullPicsImgInfo message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PullPicsImgInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Action.PullPicsImgInfo;

        /**
         * Gets the default type url for PullPicsImgInfo
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }

    /** Properties of a PullPicsResp. */
    interface IPullPicsResp {

        /** PullPicsResp info */
        info?: (Action.IPullPicsImgInfo[]|null);
    }

    /** Represents a PullPicsResp. */
    class PullPicsResp implements IPullPicsResp {

        /**
         * Constructs a new PullPicsResp.
         * @param [properties] Properties to set
         */
        constructor(properties?: Action.IPullPicsResp);

        /** PullPicsResp info. */
        public info: Action.IPullPicsImgInfo[];

        /**
         * Encodes the specified PullPicsResp message. Does not implicitly {@link Action.PullPicsResp.verify|verify} messages.
         * @param message PullPicsResp message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: Action.IPullPicsResp, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a PullPicsResp message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns PullPicsResp
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): Action.PullPicsResp;

        /**
         * Gets the default type url for PullPicsResp
         * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
         * @returns The default type url
         */
        public static getTypeUrl(typeUrlPrefix?: string): string;
    }
}
