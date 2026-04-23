/** 侧栏拖入终端：与文件树拖拽 MIME 区分 */
export const CC_SLASH_DRAG_MIME = 'application/x-claude-cc-slash+json'

/** text/plain 回退：无自定义 MIME 时仍可识别（部分环境会丢 MIME） */
export const CC_SLASH_PLAIN_PREFIX = '__CC_SLASH__:'
