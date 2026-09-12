import React, { useState } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Input, 
  Select, 
  Space, 
  Tag, 
  Modal, 
  Form, 
  InputNumber, 
  message, 
  Popconfirm, 
  Row, 
  Col, 
  Tooltip,
  Image,
  Statistic,
  Drawer,
  Descriptions,
  Badge
} from 'antd';
import { 
  PlusOutlined, 
  EditOutlined, 
  DeleteOutlined, 
  DownloadOutlined, 
  SearchOutlined, 
  DatabaseOutlined,
  PictureOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  LinkOutlined
} from '@ant-design/icons';
import { useData } from '../context/DataContext';
import { useAppTheme } from '../context/ThemeContext';
import type { MasterDataItem, MasterDataStatus } from '../types';

export const NO_IMAGE_FALLBACK = '/images/no_image.svg';

const { Option } = Select;

export const MasterData: React.FC = () => {
  const { masterData, addMasterDataItem, updateMasterDataItem, deleteMasterDataItem } = useData();
  const { isDark } = useAppTheme();

  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterDataItem | null>(null);
  const [detailItem, setDetailItem] = useState<MasterDataItem | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [modalImages, setModalImages] = useState<string[]>([]);
  const [imageUrlInput, setImageUrlInput] = useState<string>('');
  const [form] = Form.useForm();

  // Preset package types
  const packageTypes = [
    'Rolled Vacuum Box',
    'Corrugated Carton Box',
    'Heavy-duty Polybag',
    'Heavy-duty Corrugated Crate',
    'Custom Wooden Crate',
    'Shrink-wrapped Bundle',
  ];

  // Preset categories
  const categories = ['Mattress', 'Sofa', 'Recliner', 'Bed Frame', 'Pillow', 'Accessories'];

  const handleOpenDetail = (item: MasterDataItem) => {
    setDetailItem(item);
    setDetailDrawerOpen(true);
  };

  const handleOpenModal = (item?: MasterDataItem) => {
    setImageUrlInput('');
    if (item) {
      setEditingItem(item);
      let existingImgs: string[] = [];
      if (Array.isArray(item.images) && item.images.length > 0) {
        existingImgs = item.images;
      } else if (Array.isArray(item.fgImage) && item.fgImage.length > 0) {
        existingImgs = item.fgImage;
      } else if (typeof item.fgImage === 'string' && item.fgImage && item.fgImage !== NO_IMAGE_FALLBACK) {
        existingImgs = [item.fgImage];
      }
      setModalImages(existingImgs.filter(Boolean).slice(0, 4));

      form.setFieldsValue({
        materialCode: item.materialCode,
        partNumber: item.partNumber,
        category: item.category || 'Mattress',
        model: item.model || item.productName || '',
        productDescription: item.productDescription || item.productName || '',
        lengthMm: item.dimensions?.lengthMm || 0,
        widthMm: item.dimensions?.widthMm || 0,
        heightMm: item.dimensions?.heightMm || 0,
        netWeight: item.netWeight ?? item.weightKg ?? 0,
        grossWeight: item.grossWeight ?? (item.netWeight ? item.netWeight + 2.5 : 0),
        packageType: item.packageType || 'Rolled Vacuum Box',
        status: item.status || (item.isActive !== false ? 'Active' : 'Inactive'),
      });
    } else {
      setEditingItem(null);
      form.resetFields();
      setModalImages([]);
      form.setFieldsValue({
        category: 'Mattress',
        model: '',
        packageType: 'Rolled Vacuum Box',
        status: 'Active' as MasterDataStatus,
        netWeight: 20.0,
        grossWeight: 22.5,
        lengthMm: 1981,
        widthMm: 1828,
        heightMm: 203,
      });
    }
    setIsModalOpen(true);
  };

  // Image URL Link Handlers (Direct URLs, Max 4 images, text input instead of file upload)
  const handleAddImageUrl = (urlToAdd?: string) => {
    const rawUrl = urlToAdd !== undefined ? urlToAdd : imageUrlInput;
    const url = (rawUrl || '').trim();

    if (!url) {
      message.warning('Please enter an image URL link.');
      return;
    }

    if (modalImages.length >= 4) {
      message.warning('Maximum 4 image URLs allowed per Finished Good SKU.');
      return;
    }

    if (modalImages.includes(url)) {
      message.info('This image URL is already added.');
      return;
    }

    setModalImages(prev => [...prev, url]);
    setImageUrlInput('');
    message.success('Added image URL link.');
  };

  const handleRemoveImage = (index: number) => {
    setModalImages(prev => prev.filter((_, i) => i !== index));
    message.info('Image URL removed.');
  };

  const handleFormSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      const finalImages = modalImages.slice(0, 4);

      const payload: Omit<MasterDataItem, 'id' | 'createdAt' | 'updatedAt'> = {
        fgImage: finalImages.length > 0 ? finalImages : [NO_IMAGE_FALLBACK],
        images: finalImages,
        materialCode: values.materialCode.toUpperCase().trim(),
        partNumber: values.partNumber.toUpperCase().trim(),
        category: values.category,
        model: values.model.trim(),
        productDescription: values.productDescription.trim(),
        dimensions: {
          lengthMm: Number(values.lengthMm) || 0,
          widthMm: Number(values.widthMm) || 0,
          heightMm: Number(values.heightMm) || 0,
        },
        netWeight: Number(values.netWeight) || 0,
        grossWeight: Number(values.grossWeight) || 0,
        packageType: values.packageType,
        status: values.status as MasterDataStatus,

        // Compat fields
        productName: values.productDescription.trim(),
        weightKg: Number(values.netWeight) || 0,
        isActive: values.status === 'Active',
      };

      if (editingItem) {
        updateMasterDataItem(editingItem.id, payload);
        message.success(`Updated Master SKU: ${payload.materialCode}`);
        if (detailItem && detailItem.id === editingItem.id) {
          setDetailItem({ ...detailItem, ...payload });
        }
      } else {
        addMasterDataItem(payload);
        message.success(`Registered New Master SKU: ${payload.materialCode}`);
      }

      setIsModalOpen(false);
      form.resetFields();
    } catch (err) {
      console.error('Form validation failed', err);
    }
  };

  const handleDelete = (id: string, code: string) => {
    deleteMasterDataItem(id);
    message.success(`Master Data SKU ${code} removed.`);
    if (detailItem && detailItem.id === id) {
      setDetailDrawerOpen(false);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'FG Image,Material Code,Part Number,Category,Model,Product Description,Dimensions (LxWxH mm),Net Weight (kg),Gross Weight (kg),Package Type,Status'
    ];
    const rows = filteredData.map(item => {
      let img = '';
      if (Array.isArray(item.fgImage)) {
        img = item.fgImage.join('; ');
      } else if (Array.isArray(item.images)) {
        img = item.images.join('; ');
      } else if (typeof item.fgImage === 'string') {
        img = item.fgImage;
      }
      const model = item.model || '';
      const desc = (item.productDescription || item.productName || '').replace(/"/g, '""');
      const dim = `${item.dimensions?.lengthMm || 0}x${item.dimensions?.widthMm || 0}x${item.dimensions?.heightMm || 0}`;
      const netW = item.netWeight ?? item.weightKg ?? 0;
      const grossW = item.grossWeight ?? 0;
      const pkg = item.packageType || '';
      const st = item.status || (item.isActive ? 'Active' : 'Inactive');

      return `"${img}","${item.materialCode}","${item.partNumber}","${item.category}","${model}","${desc}","${dim}","${netW}","${grossW}","${pkg}","${st}"`;
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Wakefit_MasterData_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Master Data catalog exported to CSV.');
  };

  const filteredData = masterData.filter(item => {
    const desc = item.productDescription || item.productName || '';
    const model = item.model || '';
    const matchesSearch =
      item.materialCode.toLowerCase().includes(searchText.toLowerCase()) ||
      item.partNumber.toLowerCase().includes(searchText.toLowerCase()) ||
      model.toLowerCase().includes(searchText.toLowerCase()) ||
      desc.toLowerCase().includes(searchText.toLowerCase());

    const matchesCategory = selectedCategory === 'ALL' || item.category === selectedCategory;
    
    const itemStatus = item.status || (item.isActive !== false ? 'Active' : 'Inactive');
    const matchesStatus = selectedStatus === 'ALL' || itemStatus === selectedStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const totalActive = masterData.filter(i => (i.status || (i.isActive !== false ? 'Active' : 'Inactive')) === 'Active').length;
  const totalOnHold = masterData.filter(i => i.status === 'On hold').length;
  const totalInactive = masterData.filter(i => (i.status || (i.isActive === false ? 'Inactive' : 'Active')) === 'Inactive').length;

  const renderStatusTag = (status?: MasterDataStatus | string, isActive?: boolean) => {
    const effectiveStatus: MasterDataStatus = (status as MasterDataStatus) || (isActive !== false ? 'Active' : 'Inactive');
    switch (effectiveStatus) {
      case 'Active':
        return <Tag color="success" icon={<CheckCircleOutlined />}>Active</Tag>;
      case 'On hold':
        return <Tag color="warning" icon={<ClockCircleOutlined />}>On hold</Tag>;
      case 'Inactive':
        return <Tag color="default" icon={<StopOutlined />}>Inactive</Tag>;
      default:
        return <Tag>{effectiveStatus}</Tag>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Metrics Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card
            bordered={false}
            style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
          >
            <Statistic
              title={<span style={{ fontSize: '12px', color: '#64748b' }}>Total Master SKUs</span>}
              value={masterData.length}
              prefix={<DatabaseOutlined style={{ color: '#E53935' }} />}
              valueStyle={{ fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card
            bordered={false}
            style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
          >
            <Statistic
              title={<span style={{ fontSize: '12px', color: '#64748b' }}>Active Products</span>}
              value={totalActive}
              prefix={<CheckCircleOutlined style={{ color: '#10B981' }} />}
              valueStyle={{ fontWeight: 800, color: '#10B981' }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card
            bordered={false}
            style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
          >
            <Statistic
              title={<span style={{ fontSize: '12px', color: '#64748b' }}>On Hold</span>}
              value={totalOnHold}
              prefix={<ClockCircleOutlined style={{ color: '#F59E0B' }} />}
              valueStyle={{ fontWeight: 800, color: '#F59E0B' }}
            />
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card
            bordered={false}
            style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
          >
            <Statistic
              title={<span style={{ fontSize: '12px', color: '#64748b' }}>Inactive</span>}
              value={totalInactive}
              prefix={<StopOutlined style={{ color: '#94a3b8' }} />}
              valueStyle={{ fontWeight: 800, color: '#94a3b8' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Main Catalog Card */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DatabaseOutlined style={{ color: '#E53935', fontSize: '18px' }} />
              <span style={{ fontSize: '16px', fontWeight: 700 }}>Finished Goods Master Data Management</span>
              <Tag color="blue">{filteredData.length} Shown</Tag>
            </div>

            <Space wrap>
              <Input
                placeholder="Search Material Code / Part Number / Model / Description..."
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                style={{ width: '380px', minWidth: '240px' }}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                allowClear
              />

              <Select value={selectedCategory} onChange={setSelectedCategory} style={{ width: '150px' }}>
                <Option value="ALL">All Categories</Option>
                {categories.map(c => (
                  <Option key={c} value={c}>{c}</Option>
                ))}
              </Select>

              <Select value={selectedStatus} onChange={setSelectedStatus} style={{ width: '130px' }}>
                <Option value="ALL">All Status</Option>
                <Option value="Active">Active</Option>
                <Option value="On hold">On hold</Option>
                <Option value="Inactive">Inactive</Option>
              </Select>

              <Button icon={<DownloadOutlined />} onClick={handleExportCSV}>
                Export CSV
              </Button>

              <Button
                type="primary"
                icon={<PlusOutlined />}
                style={{ backgroundColor: '#E53935', borderColor: '#E53935', fontWeight: 600 }}
                onClick={() => handleOpenModal()}
              >
                Add FG SKU
              </Button>
            </Space>
          </div>
        }
        bordered={false}
        style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderRadius: '12px' }}
      >
        {/* Simplified Table with Mandatory Info & Details Action */}
        <Table
          dataSource={filteredData}
          rowKey="id"
          pagination={{ pageSize: 8, showSizeChanger: true }}
          columns={[
            {
              title: 'FG Image',
              key: 'fgImage',
              width: 85,
              align: 'center',
              render: (_, r) => {
                let allImgs: string[] = [];
                if (Array.isArray(r.images) && r.images.length > 0) {
                  allImgs = r.images;
                } else if (Array.isArray(r.fgImage) && r.fgImage.length > 0) {
                  allImgs = r.fgImage;
                } else if (typeof r.fgImage === 'string' && r.fgImage) {
                  allImgs = [r.fgImage];
                } else {
                  allImgs = [NO_IMAGE_FALLBACK];
                }
                const primaryImg = allImgs[0] || NO_IMAGE_FALLBACK;
                const extraCount = allImgs.length - 1;

                return (
                  <Badge count={extraCount > 0 ? `+${extraCount}` : 0} offset={[-2, 4]} color="#0284C7">
                    <Image
                      src={primaryImg}
                      fallback={NO_IMAGE_FALLBACK}
                      alt={r.model || r.materialCode}
                      width={52}
                      height={40}
                      style={{ objectFit: 'cover', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                      preview={{
                        mask: <PictureOutlined style={{ fontSize: '13px' }} />,
                      }}
                    />
                  </Badge>
                );
              },
            },
            {
              title: 'Material Code',
              dataIndex: 'materialCode',
              key: 'materialCode',
              width: 150,
              render: (code: string) => (
                <strong style={{ color: '#E53935', fontFamily: 'monospace', fontSize: '13px' }}>
                  {code}
                </strong>
              ),
            },
            {
              title: 'Part Number',
              dataIndex: 'partNumber',
              key: 'partNumber',
              width: 150,
              render: (part: string) => (
                <strong style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                  {part}
                </strong>
              ),
            },
            {
              title: 'Category',
              dataIndex: 'category',
              key: 'category',
              width: 110,
              render: (cat: string) => {
                let color = 'magenta';
                if (cat === 'Sofa') color = 'blue';
                if (cat === 'Recliner') color = 'volcano';
                if (cat === 'Bed Frame') color = 'geekblue';
                if (cat === 'Pillow') color = 'cyan';
                return <Tag color={color} style={{ fontWeight: 700 }}>{cat}</Tag>;
              },
            },
            {
              title: 'Model & Product Description',
              key: 'modelDesc',
              render: (_, r) => (
                <div>
                  <strong style={{ fontSize: '13px', color: isDark ? '#f8fafc' : '#0f172a' }}>
                    {r.model || r.productName || '—'}
                  </strong>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {r.productDescription || r.productName}
                  </div>
                </div>
              ),
            },
            {
              title: 'Dimensions',
              key: 'dimensions',
              width: 160,
              render: (_, r) => {
                const l = r.dimensions?.lengthMm || 0;
                const w = r.dimensions?.widthMm || 0;
                const h = r.dimensions?.heightMm || 0;
                return (
                  <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#64748b' }}>
                    {l}×{w}×{h} mm
                  </span>
                );
              },
            },
            {
              title: 'Status',
              key: 'status',
              width: 110,
              align: 'center',
              render: (_, r) => renderStatusTag(r.status, r.isActive),
            },
            {
              title: 'Actions',
              key: 'actions',
              width: 160,
              align: 'center',
              render: (_, r) => (
                <Space size="small">
                  <Button
                    type="primary"
                    size="small"
                    icon={<EyeOutlined />}
                    style={{
                      backgroundColor: '#1E3A5F',
                      borderColor: '#1E3A5F',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '4px'
                    }}
                    onClick={() => handleOpenDetail(r)}
                  >
                    Details
                  </Button>

                  <Tooltip title="Edit Finished Good SKU">
                    <Button
                      type="text"
                      icon={<EditOutlined style={{ color: '#0284C7' }} />}
                      onClick={() => handleOpenModal(r)}
                    />
                  </Tooltip>

                  <Popconfirm
                    title="Delete Finished Good SKU?"
                    description={`Are you sure you want to remove ${r.materialCode}?`}
                    onConfirm={() => handleDelete(r.id, r.materialCode)}
                    okText="Yes, Delete"
                    cancelText="Cancel"
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* Product Detail View Drawer */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <InfoCircleOutlined style={{ color: '#E53935', fontSize: '18px' }} />
            <span>Finished Good Details: <strong>{detailItem?.materialCode}</strong></span>
          </div>
        }
        placement="right"
        width={560}
        onClose={() => setDetailDrawerOpen(false)}
        open={detailDrawerOpen}
        extra={
          <Space>
            {detailItem && (
              <Button
                type="primary"
                icon={<EditOutlined />}
                style={{ backgroundColor: '#0284C7', borderColor: '#0284C7', fontWeight: 600 }}
                onClick={() => {
                  setDetailDrawerOpen(false);
                  handleOpenModal(detailItem);
                }}
              >
                Edit SKU
              </Button>
            )}
          </Space>
        }
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Top Product Showcase Card with Multi-Image Gallery */}
            <div
              style={{
                borderRadius: '10px',
                overflow: 'hidden',
                border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                backgroundColor: isDark ? '#0f172a' : '#f8fafc',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <Image.PreviewGroup>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxWidth: '240px' }}>
                      {(() => {
                        let allImgs: string[] = [];
                        if (Array.isArray(detailItem.images) && detailItem.images.length > 0) {
                          allImgs = detailItem.images;
                        } else if (Array.isArray(detailItem.fgImage) && detailItem.fgImage.length > 0) {
                          allImgs = detailItem.fgImage;
                        } else if (typeof detailItem.fgImage === 'string' && detailItem.fgImage) {
                          allImgs = [detailItem.fgImage];
                        } else {
                          allImgs = [NO_IMAGE_FALLBACK];
                        }
                        return allImgs.map((imgUrl, idx) => (
                          <div key={idx} style={{ position: 'relative' }}>
                            <Image
                              src={imgUrl}
                              fallback={NO_IMAGE_FALLBACK}
                              alt={`${detailItem.model} ${idx + 1}`}
                              width={idx === 0 ? 110 : 50}
                              height={idx === 0 ? 80 : 80}
                              style={{ 
                                objectFit: 'cover', 
                                borderRadius: '6px', 
                                border: `1px solid ${isDark ? '#475569' : '#cbd5e1'}` 
                              }}
                            />
                          </div>
                        ));
                      })()}
                    </div>
                  </Image.PreviewGroup>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <Tag color="blue" style={{ fontWeight: 700, margin: 0 }}>{detailItem.category}</Tag>
                    {renderStatusTag(detailItem.status, detailItem.isActive)}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                    {detailItem.model || detailItem.productName}
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    ERP Material Code: <strong style={{ color: '#E53935', fontFamily: 'monospace' }}>{detailItem.materialCode}</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                    Images: <strong style={{ color: (detailItem.images && detailItem.images.length > 0) ? (isDark ? '#93c5fd' : '#0284c7') : '#94a3b8' }}>
                      {detailItem.images && detailItem.images.length > 0 
                        ? `${detailItem.images.length} photo${detailItem.images.length > 1 ? 's' : ''} attached` 
                        : 'No photos (Fallback placeholder)'}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Complete Specifications Grid */}
            <Descriptions
              title={<span style={{ fontSize: '14px', fontWeight: 700 }}>Item Specifications & Attributes</span>}
              bordered
              size="small"
              column={1}
              style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff' }}
            >
              <Descriptions.Item label="Material Code">
                <strong style={{ color: '#E53935', fontFamily: 'monospace' }}>{detailItem.materialCode}</strong>
              </Descriptions.Item>

              <Descriptions.Item label="Part Number">
                <strong style={{ fontFamily: 'monospace' }}>{detailItem.partNumber}</strong>
              </Descriptions.Item>

              <Descriptions.Item label="Category">
                <Tag color="blue">{detailItem.category}</Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Model">
                <strong>{detailItem.model || '—'}</strong>
              </Descriptions.Item>

              <Descriptions.Item label="Product Description">
                {detailItem.productDescription || detailItem.productName}
              </Descriptions.Item>

              <Descriptions.Item label="Dimensions (LxWxH) mm">
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {detailItem.dimensions?.lengthMm || 0} × {detailItem.dimensions?.widthMm || 0} × {detailItem.dimensions?.heightMm || 0} mm
                </span>
              </Descriptions.Item>

              <Descriptions.Item label="Net Weight">
                <strong>{Number(detailItem.netWeight ?? detailItem.weightKg ?? 0).toFixed(2)} kg</strong>
              </Descriptions.Item>

              <Descriptions.Item label="Gross Weight">
                <strong>{Number(detailItem.grossWeight ?? 0).toFixed(2)} kg</strong>
              </Descriptions.Item>

              <Descriptions.Item label="Package Type">
                <Tag color="default">{detailItem.packageType || 'Rolled Vacuum Box'}</Tag>
              </Descriptions.Item>

              <Descriptions.Item label="Status">
                {renderStatusTag(detailItem.status, detailItem.isActive)}
              </Descriptions.Item>

              <Descriptions.Item label="Barcode / RFID Schemes">
                <Space direction="vertical" size={2}>
                  <div>Barcode: <Tag color="geekblue">{detailItem.standardBarcodeType || 'Code128'}</Tag></div>
                  <div>RFID Inlay: <span style={{ fontSize: '11px', color: '#64748b' }}>{detailItem.rfidInlayType || 'EPC Gen2 SGTIN-96'}</span></div>
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label="Image URLs (fg_image list)">
                {(() => {
                  let urls: string[] = [];
                  if (Array.isArray(detailItem.fgImage) && detailItem.fgImage.length > 0) {
                    urls = detailItem.fgImage;
                  } else if (Array.isArray(detailItem.images) && detailItem.images.length > 0) {
                    urls = detailItem.images;
                  } else if (typeof detailItem.fgImage === 'string' && detailItem.fgImage) {
                    urls = [detailItem.fgImage];
                  }

                  if (urls.length === 0) {
                    return <span style={{ color: '#94a3b8' }}>No custom URLs configured (using default fallback)</span>;
                  }

                  return (
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      {urls.map((url, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
                          <Tag color={i === 0 ? 'gold' : 'blue'} style={{ margin: 0, fontWeight: 700 }}>
                            {i === 0 ? '⭐ Primary' : `#${i + 1}`}
                          </Tag>
                          <a href={url} target="_blank" rel="noreferrer" style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>
                            {url}
                          </a>
                        </div>
                      ))}
                    </Space>
                  );
                })()}
              </Descriptions.Item>

              <Descriptions.Item label="Created At">
                <span style={{ fontSize: '11px', color: '#64748b' }}>{detailItem.createdAt || '2026-08-31 10:00:00'}</span>
              </Descriptions.Item>

              <Descriptions.Item label="Last Modified">
                <span style={{ fontSize: '11px', color: '#64748b' }}>{detailItem.updatedAt || '2026-08-31 12:00:00'}</span>
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Drawer>

      {/* Create / Edit SKU Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DatabaseOutlined style={{ color: '#E53935' }} />
            <span>{editingItem ? `Edit SKU: ${editingItem.materialCode}` : 'Register New Finished Good SKU'}</span>
          </div>
        }
        open={isModalOpen}
        onOk={handleFormSubmit}
        onCancel={() => setIsModalOpen(false)}
        okText={editingItem ? 'Save Changes' : 'Create Master SKU'}
        okButtonProps={{ style: { backgroundColor: '#E53935', borderColor: '#E53935', fontWeight: 600 } }}
        width={750}
        centered
      >
        <Form form={form} layout="vertical" style={{ marginTop: '16px' }}>
          {/* Multi-Image URL Input & Management Section */}
          <div 
            style={{ 
              backgroundColor: isDark ? '#1e293b' : '#f8fafc', 
              padding: '16px', 
              borderRadius: '10px', 
              border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: '14px', color: isDark ? '#f8fafc' : '#0f172a' }}>
                  Finished Good Image URLs (fg_image, Max 4 URLs)
                </span>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  Enter or paste direct image links (e.g. AWS S3 URLs). Up to 4 links can be saved as a list in the database.
                </div>
              </div>

              <Tag color={modalImages.length >= 4 ? 'error' : modalImages.length > 0 ? 'success' : 'default'} style={{ fontWeight: 700, fontSize: '12px' }}>
                {modalImages.length} / 4 URLs Added
              </Tag>
            </div>

            {/* URL Text Input & Add Button */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <Input
                prefix={<LinkOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Paste or enter image URL (e.g. https://wakefit-co.s3.ap-south-1.amazonaws.com/img/npl_raw_images/WSFANPRN1FOBL.jpg)"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                onPressEnter={() => handleAddImageUrl()}
                disabled={modalImages.length >= 4}
                allowClear
                style={{ flex: 1 }}
              />
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => handleAddImageUrl()}
                disabled={modalImages.length >= 4 || !imageUrlInput.trim()}
                style={{ backgroundColor: modalImages.length >= 4 || !imageUrlInput.trim() ? undefined : '#E53935' }}
              >
                Add Image Link
              </Button>
            </div>

            {/* Quick Helper Shortcuts */}
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Quick Link Presets:</span>
              <Button
                size="small"
                type="dashed"
                style={{ fontSize: '11px', height: '24px', padding: '0 8px', color: '#0284c7', borderColor: '#38bdf8' }}
                disabled={modalImages.length >= 4 || modalImages.includes('https://wakefit-co.s3.ap-south-1.amazonaws.com/img/npl_raw_images/WSFANPRN1FOBL.jpg')}
                onClick={() => handleAddImageUrl('https://wakefit-co.s3.ap-south-1.amazonaws.com/img/npl_raw_images/WSFANPRN1FOBL.jpg')}
              >
                + Wakefit S3 Sample URL
              </Button>
              <Space size={6} wrap>
                {[
                  { label: 'Mattress 1', url: '/products/mattress_1.jpg' },
                  { label: 'Mattress 2', url: '/products/mattress_2.jpg' },
                  { label: 'Sofa 1', url: '/products/sofa_1.jpg' },
                  { label: 'Recliner 1', url: '/products/recliner_1.jpg' },
                ].map(stock => (
                  <Button
                    key={stock.url}
                    size="small"
                    style={{ fontSize: '11px', height: '24px', padding: '0 8px' }}
                    disabled={modalImages.includes(stock.url) || modalImages.length >= 4}
                    onClick={() => handleAddImageUrl(stock.url)}
                  >
                    +{stock.label}
                  </Button>
                ))}
              </Space>
            </div>

            {/* List of Configured Image URLs with Previews */}
            {modalImages.length === 0 ? (
              <div
                style={{
                  padding: '16px',
                  borderRadius: '8px',
                  border: `1px dashed ${isDark ? '#475569' : '#cbd5e1'}`,
                  textAlign: 'center',
                  backgroundColor: isDark ? 'rgba(15, 23, 42, 0.4)' : '#ffffff',
                }}
              >
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  No image links added yet. Paste image URLs above or click <strong>+ Wakefit S3 Sample URL</strong>.
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  (If left empty, the fallback placeholder image will be used)
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {modalImages.map((url, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                      <Image
                        src={url}
                        fallback={NO_IMAGE_FALLBACK}
                        alt={`Image ${idx + 1}`}
                        width={52}
                        height={40}
                        style={{ objectFit: 'cover', borderRadius: '4px', border: '1px solid #e2e8f0' }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                          <Tag color={idx === 0 ? 'gold' : 'blue'} style={{ fontSize: '10px', lineHeight: '18px', padding: '0 6px', margin: 0, fontWeight: 700 }}>
                            {idx === 0 ? '⭐ #1 Primary Image' : `#${idx + 1} Supplementary`}
                          </Tag>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Slot {idx + 1} of 4</span>
                        </div>
                        <span 
                          style={{ 
                            fontSize: '11px', 
                            fontFamily: 'monospace', 
                            color: isDark ? '#93c5fd' : '#0284c7', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            maxWidth: '460px' 
                          }}
                          title={url}
                        >
                          {url}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Button
                        type="text"
                        size="small"
                        icon={<LinkOutlined />}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        title="Open image link in new tab"
                      />
                      <Tooltip title="Remove Image Link">
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handleRemoveImage(idx)}
                        />
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Row 1: Category, Material Code, Part Number, Model */}
          <Row gutter={16}>
            <Col xs={24} sm={6}>
              <Form.Item 
                name="category" 
                label="Category" 
                rules={[{ required: true, message: 'Category is required' }]}
              >
                <Select placeholder="Select Category">
                  {categories.map(c => (
                    <Option key={c} value={c}>{c}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} sm={6}>
              <Form.Item
                name="materialCode"
                label="Material Code"
                tooltip="Unique ERP Finished Goods Material Code"
                rules={[{ required: true, message: 'Material Code is required' }]}
              >
                <Input placeholder="WAK-MAT-787208" style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>

            <Col xs={24} sm={6}>
              <Form.Item
                name="partNumber"
                label="Part Number"
                tooltip="Internal Manufacturing FG Part Identifier"
                rules={[{ required: true, message: 'Part Number is required' }]}
              >
                <Input placeholder="FG-ORT-KNG-08" style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>

            <Col xs={24} sm={6}>
              <Form.Item
                name="model"
                label="Model"
                rules={[{ required: true, message: 'Model is required' }]}
              >
                <Input placeholder="ShapeSense Ortho Pro" />
              </Form.Item>
            </Col>
          </Row>

          {/* Row 2: Product Description */}
          <Form.Item
            name="productDescription"
            label="Product Description"
            rules={[{ required: true, message: 'Product description is required' }]}
          >
            <Input.TextArea 
              rows={2} 
              placeholder="Orthopaedic Memory Foam Mattress (King - 78x72x8 inch)" 
            />
          </Form.Item>

          {/* Row 3: Dimensions (LxWxH) mm */}
          <Row gutter={16}>
            <Col xs={8}>
              <Form.Item 
                name="lengthMm" 
                label="Length (L) mm"
                rules={[{ required: true, message: 'Length is required' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} placeholder="1981" addonAfter="mm" />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item 
                name="widthMm" 
                label="Width (W) mm"
                rules={[{ required: true, message: 'Width is required' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} placeholder="1828" addonAfter="mm" />
              </Form.Item>
            </Col>
            <Col xs={8}>
              <Form.Item 
                name="heightMm" 
                label="Height (H) mm"
                rules={[{ required: true, message: 'Height is required' }]}
              >
                <InputNumber min={0} style={{ width: '100%' }} placeholder="203" addonAfter="mm" />
              </Form.Item>
            </Col>
          </Row>

          {/* Row 4: Weights, Package Type, Status */}
          <Row gutter={16}>
            <Col xs={24} sm={6}>
              <Form.Item 
                name="netWeight" 
                label="Net Weight"
                rules={[{ required: true, message: 'Net weight is required' }]}
              >
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="28.5" addonAfter="kg" />
              </Form.Item>
            </Col>

            <Col xs={24} sm={6}>
              <Form.Item 
                name="grossWeight" 
                label="Gross Weight"
                rules={[{ required: true, message: 'Gross weight is required' }]}
              >
                <InputNumber min={0} step={0.1} style={{ width: '100%' }} placeholder="31.2" addonAfter="kg" />
              </Form.Item>
            </Col>

            <Col xs={24} sm={6}>
              <Form.Item 
                name="packageType" 
                label="Package Type"
                rules={[{ required: true, message: 'Package type is required' }]}
              >
                <Select placeholder="Package Type">
                  {packageTypes.map(p => (
                    <Option key={p} value={p}>{p}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} sm={6}>
              <Form.Item 
                name="status" 
                label="Status"
                rules={[{ required: true, message: 'Status is required' }]}
              >
                <Select placeholder="Status">
                  <Option value="Active">
                    <Tag color="success" style={{ margin: 0 }}>Active</Tag>
                  </Option>
                  <Option value="On hold">
                    <Tag color="warning" style={{ margin: 0 }}>On hold</Tag>
                  </Option>
                  <Option value="Inactive">
                    <Tag color="default" style={{ margin: 0 }}>Inactive</Tag>
                  </Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};
