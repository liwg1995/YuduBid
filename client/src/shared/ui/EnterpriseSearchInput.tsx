import { CloseCircleFilled, SearchOutlined } from '@ant-design/icons';
import { Input, type InputProps, type InputRef } from 'antd';
import { forwardRef } from 'react';

/** 输入即筛选的列表搜索框，不提供重复的提交按钮。 */
const EnterpriseSearchInput = forwardRef<InputRef, Omit<InputProps, 'prefix'>>(({ allowClear, className, ...props }, ref) => (
  <Input {...props} ref={ref} className={["enterprise-search-input", className].filter(Boolean).join(" ")} allowClear={allowClear === true ? { clearIcon: <CloseCircleFilled aria-label="清除搜索" /> } : allowClear} prefix={<SearchOutlined aria-hidden="true" />} />
));
EnterpriseSearchInput.displayName = 'EnterpriseSearchInput';

export default EnterpriseSearchInput;
