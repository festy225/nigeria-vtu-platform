import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateCustomerAddressDto } from '../src/modules/marketplace-customer-addresses/dto/create-customer-address.dto';
import { UpdateCustomerAddressDto } from '../src/modules/marketplace-customer-addresses/dto/update-customer-address.dto';
import { CreateSellerLocationDto } from '../src/modules/sellers/dto/create-seller-location.dto';

describe('Marketplace location DTO coordinate validation', () => {
  const dtoCases = [
    {
      name: 'CreateCustomerAddressDto',
      DtoClass: CreateCustomerAddressDto,
      validFields: {
        recipientName: 'Test Customer',
        recipientPhone: '08012345678',
        addressLine1: '1 Test Street',
        city: 'Lagos',
        countryCode: 'NG',
      },
    },
    {
      name: 'UpdateCustomerAddressDto',
      DtoClass: UpdateCustomerAddressDto,
      validFields: {},
    },
    {
      name: 'CreateSellerLocationDto',
      DtoClass: CreateSellerLocationDto,
      validFields: {
        locationName: 'Main Warehouse',
        addressLine1: '1 Test Street',
        city: 'Lagos',
        countryCode: 'NG',
      },
    },
  ] as const;

  describe.each(dtoCases)('$name', ({ DtoClass, validFields }) => {
    const validateDto = (coordinates: Record<string, unknown>) => {
      const dto = plainToInstance(DtoClass, {
        ...validFields,
        ...coordinates,
      });

      return validateSync(dto);
    };

    it('accepts valid numeric coordinates', () => {
      expect(
        validateDto({ latitude: 6.5244, longitude: 3.3792 }),
      ).toHaveLength(0);
    });

    it('rejects latitude outside the permitted range', () => {
      const errors = validateDto({ latitude: 91 });

      expect(errors.some((error) => error.property === 'latitude')).toBe(true);
    });

    it('rejects longitude outside the permitted range', () => {
      const errors = validateDto({ longitude: 181 });

      expect(errors.some((error) => error.property === 'longitude')).toBe(true);
    });

    it('rejects non-numeric coordinates', () => {
      const errors = validateDto({ latitude: 'not-a-number' });

      expect(errors.some((error) => error.property === 'latitude')).toBe(true);
    });
  });
});
