import { useI18n } from '@/i18n';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getIdentityOrganization, updateIdentityOrganization } from '@/api/identity';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Building2, FileText, CheckCircle2, Upload, AlertCircle } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';

export default function ConfiguracionNegocio() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { effectiveOrgId } = useAuthContext();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const { data: organization, isLoading } = useQuery({
    queryKey: ['organization', effectiveOrgId],
    queryFn: async () => {
      const result = await getIdentityOrganization(effectiveOrgId);
      return result.organization;
    },
    enabled: !!effectiveOrgId,
  });

  const updateOrgMutation = useMutation({
    mutationFn: (data) => updateIdentityOrganization(effectiveOrgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    },
  });

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      updateOrgMutation.mutate({ logo_url: file_url });
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo subir el logo', description: 'Revisa el archivo e inténtalo nuevamente.' });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitComercial = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    updateOrgMutation.mutate({
      name: formData.get('name'),
      email: formData.get('email'),
      telefono_negocio: formData.get('telefono_negocio'),
      direccion_comercial: formData.get('direccion_comercial'),
    });
  };

  const handleSubmitLegal = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    updateOrgMutation.mutate({
      tipo_entidad: formData.get('tipo_entidad'),
      identificacion_fiscal: formData.get('identificacion_fiscal'),
      legal_name: formData.get('legal_name'),
      direccion_fiscal: formData.get('direccion_fiscal'),
    });
  };

  if (isLoading) {
    return <div className="text-center p-8">{t('finalI18n.loadingSettings','Cargando configuración...')}</div>;
  }

  return (
    <div className="space-y-6">
      {showSuccess && (
        <Alert className="bg-emerald-50 border-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <AlertDescription className="text-emerald-800">
            Configuración actualizada correctamente
          </AlertDescription>
        </Alert>
      )}

      {/* Sección A: Información Comercial */}
      <Card className="border-0 shadow-xl">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>{t('config.commercialInfo','Información Comercial')}</CardTitle>
              <CardDescription>
                {t('config.commercialInfoDesc','Esta información se mostrará en cotizaciones y documentos comerciales')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmitComercial} className="space-y-6">
            {/* Logo */}
            <div className="space-y-2">
              <Label>{t('config.businessLogo','Logo del Negocio')}</Label>
              <div className="flex items-center gap-4">
                {organization?.logo_url && (
                  <img
                    src={organization.logo_url}
                    alt="Logo"
                    className="w-20 h-20 object-contain border border-slate-200 rounded-lg"
                  />
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploading}
                    className="hidden"
                    id="logo-upload"
                  />
                  <label htmlFor="logo-upload">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => document.getElementById('logo-upload').click()}
                      className="cursor-pointer"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? t('form.uploading','Subiendo...') : t('config.uploadLogo','Subir Logo')}
                    </Button>
                  </label>
                  <p className="text-xs text-slate-500 mt-2">
                    {t('config.logoFormat','Formato PNG o JPG. Recomendado 400x400px')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t('config.commercialName','Nombre Comercial *')}</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={organization?.name}
                  required
                  placeholder={t('config.commercialNamePlaceholder','Ej: Servicio Técnico Central')}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('config.contactEmail','Email de Contacto')}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={organization?.email}
                  placeholder="contacto@negocio.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefono_negocio">{t('config.phone','Teléfono')}</Label>
                <Input
                  id="telefono_negocio"
                  name="telefono_negocio"
                  defaultValue={organization?.telefono_negocio}
                  placeholder="2222-3333"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="direccion_comercial">{t('config.commercialAddress','Dirección Comercial')}</Label>
                <Textarea
                  id="direccion_comercial"
                  name="direccion_comercial"
                  defaultValue={organization?.direccion_comercial}
                  placeholder={t('config.commercialAddressPlaceholder','Dirección física visible en cotizaciones')}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateOrgMutation.isPending}>
                {updateOrgMutation.isPending ? t('form.saving','Guardando...') : t('config.saveCommercial','Guardar Información Comercial')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Sección B: Información Legal/Fiscal */}
      <Card className="border-0 shadow-xl">
        <CardHeader className="border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>{t('config.legalInfo','Información Legal / Fiscal')}</CardTitle>
              <CardDescription>
                {t('config.legalInfoDesc','Para futuras integraciones de facturación electrónica')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <Alert className="mb-6 bg-blue-50 border-blue-200">
            <AlertCircle className="w-4 h-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              {t('config.legalInfoAlert','Esta información se preparará para facturación electrónica. No se mostrará en cotizaciones.')}
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmitLegal} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo_entidad">{t('config.entityType','Tipo de Entidad')}</Label>
                <Select
                  name="tipo_entidad"
                  defaultValue={organization?.tipo_entidad || ''}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERSONA_FISICA">{t('config.personaFisica','Persona Física')}</SelectItem>
                    <SelectItem value="PERSONA_JURIDICA">{t('config.personaJuridica','Persona Jurídica')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="identificacion_fiscal">{t('config.taxId','Identificación Fiscal')}</Label>
                <Input
                  id="identificacion_fiscal"
                  name="identificacion_fiscal"
                  defaultValue={organization?.identificacion_fiscal}
                  placeholder={t('config.taxIdPlaceholder','Cédula jurídica o física')}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="legal_name">{t('config.legalName','Razón Social / Nombre Legal')}</Label>
                <Input
                  id="legal_name"
                  name="legal_name"
                  defaultValue={organization?.legal_name}
                  placeholder="Nombre legal completo"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="direccion_fiscal">{t('config.fiscalAddress','Dirección Fiscal')}</Label>
                <Textarea
                  id="direccion_fiscal"
                  name="direccion_fiscal"
                  defaultValue={organization?.direccion_fiscal}
                  placeholder={t('config.fiscalAddressPlaceholder','Dirección fiscal registrada (para facturación)')}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={updateOrgMutation.isPending}>
                {updateOrgMutation.isPending ? t('form.saving','Guardando...') : t('config.saveLegal','Guardar Información Legal')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}